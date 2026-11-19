#!/usr/bin/env bash
# 在服务器执行；现有数据库、密钥、Compose 覆盖配置均保留在部署目录。
set -Eeuo pipefail
umask 077

release=${1:?缺少提交哈希}
[[ "$release" =~ ^[0-9a-f]{40}$ ]] || { echo "提交哈希无效"; exit 1; }
root=/opt/agents-anywhere
repo="$root/Agents-Anywhere-main"
incoming="$root/incoming/$release"
image="agents-anywhere-deploy:$release"
exec 9>"$root/deploy.lock"
flock -n 9 || { echo "已有部署正在执行"; exit 1; }

test -f "$incoming/image.tar.gz"
test -f "$incoming/image.tar.gz.sha256"
test -f "$root/deploy/oauth.py"
test -f "$root/deploy/oauth-source.sha256"
cd "$incoming"
sha256sum -c image.tar.gz.sha256
gzip -dc image.tar.gz | docker load

# 只有源文件与首次核对的版本一致，才允许应用已保留的线上登录补丁。
expected=$(cat "$root/deploy/oauth-source.sha256")
actual=$(docker run --rm --entrypoint sha256sum "$image" /app/server/agent_server/services/oauth.py)
[[ "${actual%% *}" == "$expected" ]] || {
    echo "OAuth 源码已变化，需人工合并线上 PKCE 补丁，停止部署"
    exit 1
}
printf 'FROM %s\nCOPY oauth.py /app/server/agent_server/services/oauth.py\n' "$image" > "$root/deploy/Dockerfile"
docker build -t "$image" "$root/deploy"
cat > "$root/deploy/image.yml.tmp" <<EOF
services:
  migrate-next:
    image: $image
  server-next:
    image: $image
    environment:
      AGENT_SERVER_DOWNLOAD_DIR: /downloads
    volumes:
      - $root/downloads:/downloads:ro
EOF
compose=(docker compose -p agents-anywhere --env-file "$root/.env"
    -f "$repo/docker/docker-compose.postgres.yml"
    -f "$repo/docker/docker-compose.local.yml")
mkdir -p "$root/backups" "$root/downloads/mac" "$root/downloads/windows"
backup="$root/backups/before-$release-$(date +%Y%m%d%H%M%S).sql.gz"
docker exec agents-anywhere-postgres-next-1 pg_dump -U agents_anywhere agents_anywhere | gzip > "$backup"
test -s "$backup"
old=$(docker inspect agents-anywhere-server-next-1 --format '{{.Image}}')
docker tag "$old" "agents-anywhere-rollback:$release"
cp "$root/deploy/image.yml.tmp" "$root/deploy/rollback.yml"
sed -i "s|$image|agents-anywhere-rollback:$release|g" "$root/deploy/rollback.yml"

rollback() {
    echo "部署未完成；恢复旧应用镜像，数据库不自动降级。备份：$backup"
    "${compose[@]}" -f "$root/deploy/rollback.yml" up -d --no-build --no-deps server-next || true
    cp "$root/deploy/rollback.yml" "$root/deploy/image.yml"
}
trap rollback ERR
# 构建与备份成功后才进入短暂维护窗口，避免迁移期间旧服务仍访问数据库。
"${compose[@]}" stop server-next
"${compose[@]}" -f "$root/deploy/image.yml.tmp" run --rm --no-deps migrate-next
"${compose[@]}" -f "$root/deploy/image.yml.tmp" up -d --no-build --no-deps server-next
healthy=false
for attempt in $(seq 1 60); do
    if curl --fail --silent --max-time 5 http://127.0.0.1:8080/api/v2/health/ready >/dev/null; then
        healthy=true
        break
    fi
    sleep 2
done
[[ "$healthy" == true ]]
curl --fail --silent --show-error --max-time 15 https://aa.xmfind.cn/api/v2/health/ready
# 尚未上传的安装包应返回 404，不能误返回前端页面。
code=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 15 https://aa.xmfind.cn/download/windows/latest)
[[ "$code" == 200 || "$code" == 404 ]]
mv "$root/deploy/image.yml.tmp" "$root/deploy/image.yml"
printf '%s\n' "$release" > "$root/deploy/current-release"
trap - ERR
rm -f "$incoming/image.tar.gz"
echo "部署成功：$release；数据库备份：$backup"

type Options = {
  platform: string;
  isPackaged: boolean;
  openPath: (filePath: string) => Promise<string>;
  confirmQuit: () => Promise<boolean>;
  quit: () => Promise<void>;
};

export async function openUpdateInstaller(filePath: string, options: Options): Promise<void> {
  const error = await options.openPath(filePath);
  if (error) throw new Error(error);
  // DMG 只打开安装窗口，不会替用户退出正在运行的旧版。
  if (options.platform === "darwin" && options.isPackaged && await options.confirmQuit()) {
    await options.quit();
  }
}

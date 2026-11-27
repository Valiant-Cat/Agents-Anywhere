import Foundation

enum CloudDeployment {
    static var serverURL: URL {
        resolveServerURL(Bundle.main.object(forInfoDictionaryKey: "AACloudServerURL") as? String)
    }

    static func resolveServerURL(_ value: String?) -> URL {
        if let value,
           let url = URL(string: value.trimmingCharacters(in: .whitespacesAndNewlines)),
           url.scheme == "https", url.host != nil,
           url.user == nil, url.password == nil,
           url.query == nil, url.fragment == nil {
            return url
        }
        return URL(string: "https://web.agents-anywhere.com")!
    }

    static func downloadsURL(server: URL?) -> URL {
        let base = server ?? serverURL
        var components = URLComponents()
        components.scheme = base.scheme
        components.host = base.host
        components.port = base.port
        components.path = "/downloads/"
        return components.url!
    }
}

import Foundation
import Testing
@testable import ClientCore

@Suite struct CloudDeploymentTests {
    @Test func configuredCloud() {
        #expect(
            CloudDeployment.resolveServerURL(" https://private.example/ ").absoluteString ==
            "https://private.example/"
        )
    }

    @Test func invalidConfigurationFallsBack() {
        for value in ["", "$(CLOUD_SERVER_URL)", "http://private.example", "https://user:pass@private.example"] {
            #expect(
                CloudDeployment.resolveServerURL(value).absoluteString ==
                "https://web.agents-anywhere.com"
            )
        }
    }

    @Test func downloadUsesCurrentServerOrigin() {
        #expect(
            CloudDeployment.downloadsURL(server: URL(string: "https://private.example:8443/api/v2")).absoluteString ==
            "https://private.example:8443/downloads/"
        )
    }
}

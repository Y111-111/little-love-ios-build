import Foundation
import Capacitor
import Security
import Network

@objc(LoveViewController)
class LoveViewController: CAPBridgeViewController {
    override func capacitorDidLoad() { bridge?.registerPluginInstance(LoveMailPlugin()) }
}

private enum LoveError: Error { case message(String), unknown }

@objc(LoveMailPlugin)
public class LoveMailPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LoveMailPlugin"
    public let jsName = "LoveMail"
    public let pluginMethods: [CAPPluginMethod] = ["profile", "configure", "send", "read", "write"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    private let worker = DispatchQueue(label: "cn.littlelove.mail.storage")
    private let keyQuery: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "cn.littlelove.mail", kSecAttrAccount as String: "mailbox-v1"]
    private func execute(_ call: CAPPluginCall, _ work: @escaping () throws -> [String: Any]) {
        worker.async {
            do { call.resolve(try work()) }
            catch LoveError.unknown { call.reject("邮件可能已寄出，但未收到最终确认。请先检查收件箱，避免重复发送。", "DELIVERY_UNKNOWN") }
            catch LoveError.message(let message) { call.reject(message, "REQUEST_FAILED") }
            catch { call.reject("操作未完成，请检查网络、手机空间或邮箱设置后重试。", "REQUEST_FAILED") }
        }
    }
    private func recordURL(_ call: CAPPluginCall) throws -> URL {
        guard let key = call.getString("key"), ["ledger", "records"].contains(key) else { throw LoveError.message("记录类型无效。") }
        var directory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        var attributes = URLResourceValues(); attributes.isExcludedFromBackup = true; try directory.setResourceValues(attributes)
        return directory.appendingPathComponent("love-\(key).json")
    }
    @objc func read(_ call: CAPPluginCall) { execute(call) {
        let url = try self.recordURL(call)
        guard FileManager.default.fileExists(atPath: url.path) else { return ["value": NSNull()] }
        return ["value": try String(contentsOf: url, encoding: .utf8)]
    } }
    @objc func write(_ call: CAPPluginCall) { execute(call) {
        guard let value = call.getString("value"), let data = value.data(using: .utf8), data.count <= 32 * 1024 * 1024 else { throw LoveError.message("记录内容过大。") }
        _ = try JSONSerialization.jsonObject(with: data)
        let url = try self.recordURL(call)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        return [:]
    } }
    private func config() throws -> [String: String] {
        var query = keyQuery; query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?; let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return [:] }
        guard status == errSecSuccess, let bytes = result as? Data, let config = try JSONSerialization.jsonObject(with: bytes) as? [String: String] else { throw LoveError.message("邮箱安全存储暂时无法读取，请解锁手机后重试。") }
        return config
    }
    private func saveConfig(_ value: [String: String]) throws {
        let bytes = try JSONSerialization.data(withJSONObject: value)
        let values: [String: Any] = [kSecValueData as String: bytes, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        var status = SecItemUpdate(keyQuery as CFDictionary, values as CFDictionary)
        if status == errSecItemNotFound {
            status = SecItemAdd(keyQuery.merging(values) { _, new in new } as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw LoveError.message("邮箱设置未能安全保存，请解锁手机并检查空间。") }
    }
    @objc func profile(_ call: CAPPluginCall) { execute(call) {
        let config = try self.config()
        return ["name": config["name"] ?? "", "sender": config["sender"] ?? "", "recipient": config["recipient"] ?? "", "ready": !(config["auth"] ?? "").isEmpty]
    } }
    private func matches(_ value: String, _ pattern: String) -> Bool { value.range(of: pattern, options: .regularExpression) != nil }
    private func validRecipient(_ value: String) -> Bool {
        guard value.count <= 254, matches(value, "^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+@[A-Za-z0-9.-]+$") else { return false }
        let parts = value.components(separatedBy: "@")
        guard parts.count == 2, parts[0].count <= 64, !parts[0].hasPrefix("."), !parts[0].hasSuffix("."), !parts[0].contains("..") else { return false }
        let labels = parts[1].components(separatedBy: ".")
        return labels.count >= 2 && matches(labels.last ?? "", "^[A-Za-z]{2,63}$") && labels.allSatisfy { matches($0, "^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$") }
    }
    @objc func configure(_ call: CAPPluginCall) { execute(call) {
        let previous = try self.config(), sender = call.getString("sender") ?? "", recipient = call.getString("recipient") ?? "", name = call.getString("name") ?? ""
        var auth = call.getString("auth") ?? ""
        if auth.isEmpty && sender == previous["sender"] { auth = previous["auth"] ?? "" }
        guard self.matches(sender, "^[1-9][0-9]{4,19}@qq\\.com$"), self.validRecipient(recipient), sender.lowercased() != recipient.lowercased(), self.matches(auth, "^[A-Za-z]{16}$"), name.count <= 60 else { throw LoveError.message("邮箱地址或授权码格式不正确。") }
        try self.saveConfig(["name": name, "sender": sender, "recipient": recipient, "auth": auth]); return [:]
    } }
    @objc func send(_ call: CAPPluginCall) { execute(call) {
        let config = try self.config()
        guard let sender = config["sender"], let recipient = config["recipient"], let auth = config["auth"], self.matches(sender, "^[1-9][0-9]{4,19}@qq\\.com$"), self.validRecipient(recipient), self.matches(auth, "^[A-Za-z]{16}$") else { throw LoveError.message("请先配置 QQ 邮箱。") }
        let subject = call.getString("subject") ?? "", body = call.getString("body") ?? ""
        guard subject.count <= 200, body.count <= 5000, !body.isEmpty else { throw LoveError.message("邮件内容不正确。") }
        let smtp = QQConnection(); defer { smtp.close() }
        try smtp.connect()
        try smtp.expect([220]); try smtp.command("EHLO localhost", [250]); try smtp.command("AUTH LOGIN", [334])
        try smtp.command(Data(sender.utf8).base64EncodedString(), [334]); try smtp.command(Data(auth.utf8).base64EncodedString(), [235])
        try smtp.command("MAIL FROM:<\(sender)>", [250]); try smtp.command("RCPT TO:<\(recipient)>", [250, 251]); try smtp.command("DATA", [354])
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss Z"
        let encodedBody = Data(body.utf8).base64EncodedString(options: [.lineLength76Characters, .endLineWithCarriageReturn, .endLineWithLineFeed])
        let message = ["From: <\(sender)>", "To: <\(recipient)>", "Subject: =?UTF-8?B?\(Data(subject.utf8).base64EncodedString())?=", "Date: \(formatter.string(from: Date()))", "Message-ID: <\(UUID().uuidString)@qq.com>", "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", encodedBody, ".", ""].joined(separator: "\r\n")
        do { try smtp.write(message); try smtp.expect([250]) }
        catch LoveError.message(let reason) { throw LoveError.message(reason) }
        catch { throw LoveError.unknown }
        // Acceptance is final even if closing the transport fails.
        return [:]
    } }
}

// All blocking waits run on the plugin worker, never the UI or network queue.
// Network.framework performs the system TLS chain and smtp.qq.com hostname checks.
private final class QQConnection {
    private let connection = NWConnection(host: "smtp.qq.com", port: 465, using: .tls)
    private let queue = DispatchQueue(label: "cn.littlelove.mail.smtp")
    private var buffer = Data()
    private var ended = false
    private let deadline = DispatchTime.now() + 90
    private func wait(_ semaphore: DispatchSemaphore) throws {
        if semaphore.wait(timeout: min(deadline, .now() + 20)) != .success { throw NSError(domain: "QQSMTP", code: 1) }
    }
    func connect() throws {
        let semaphore = DispatchSemaphore(value: 0)
        var result: Error?; var completed = false
        connection.stateUpdateHandler = { state in
            guard !completed else { return }
            switch state {
            case .ready: completed = true; semaphore.signal()
            case .failed(let error), .waiting(let error): completed = true; result = error; semaphore.signal()
            case .cancelled: completed = true; result = NSError(domain: "QQSMTP", code: 2); semaphore.signal()
            default: break
            }
        }
        connection.start(queue: queue); try wait(semaphore); if let result = result { throw result }
    }
    func close() { connection.stateUpdateHandler = nil; connection.cancel() }
    func write(_ value: String) throws {
        let semaphore = DispatchSemaphore(value: 0); var result: Error?
        connection.send(content: Data(value.utf8), completion: .contentProcessed { error in result = error; semaphore.signal() })
        try wait(semaphore); if let result = result { throw result }
    }
    private func line() throws -> String {
        let separator = Data([13, 10])
        while true {
            if let range = buffer.range(of: separator) {
                let bytes = buffer.subdata(in: buffer.startIndex..<range.lowerBound); buffer.removeSubrange(buffer.startIndex..<range.upperBound)
                guard bytes.count <= 8192, let value = String(data: bytes, encoding: .ascii) else { throw NSError(domain: "QQSMTP", code: 3) }
                return value
            }
            guard !ended, buffer.count < 8192 else { throw NSError(domain: "QQSMTP", code: 4) }
            let semaphore = DispatchSemaphore(value: 0); var chunk: Data?; var result: Error?; var complete = false
            connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { bytes, _, done, error in chunk = bytes; complete = done; result = error; semaphore.signal() }
            try wait(semaphore); if let result = result { throw result }; if let chunk = chunk { buffer.append(chunk) }; ended = complete
        }
    }
    func expect(_ codes: [Int]) throws {
        var first: Int?
        for _ in 0..<100 {
            let response = try line(), chars = Array(response)
            guard chars.count >= 4, let code = Int(String(chars.prefix(3))), chars[3] == "-" || chars[3] == " " else { throw NSError(domain: "QQSMTP", code: 5) }
            if let first = first, code != first { throw NSError(domain: "QQSMTP", code: 6) }; first = code
            if chars[3] == "-" { continue }
            if codes.contains(code) { return }
            if [530, 534, 535].contains(code) { throw LoveError.message("QQ 邮箱授权失败，请检查授权码并开启 SMTP 服务。") }
            throw LoveError.message("QQ 邮箱暂未接受邮件，请检查邮箱限制后再试。")
        }
        throw NSError(domain: "QQSMTP", code: 7)
    }
    func command(_ value: String, _ codes: [Int]) throws { try write(value + "\r\n"); try expect(codes) }
}

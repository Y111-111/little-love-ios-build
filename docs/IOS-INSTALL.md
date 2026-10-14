# 小小心意 · iPhone 安装说明

苹果安装文件的名字是 `little-love-ios-v1.0-unsigned.ipa`。只有 Mac 编译成功并通过打包检查后，才会生成这个文件。项目源码 ZIP、安卓 APK 和打包脚本都不是苹果安装包。

## 安装包为什么叫 unsigned

`unsigned` 表示这个文件还没有绑定你的 Apple 账号的安装许可。SideStore 等工具会用你自己的免费 Apple 账号完成签名并安装，所以我们无需收集你的 Apple 密码，也不用开通付费开发者会员。

这个 IPA 不能直接在“文件”里点击安装，也不能用安卓 APK 代替。

## iPhone 16

本项目最低支持 iOS 15.4，iPhone 16 满足这一最低要求。生成通用的 iPhone 包不需要先知道你手机的具体版本。SideStore 的设置步骤仍需对照实际 iOS 版本，安装时在“设置 → 通用 → 关于本机”查看即可。

## 免费安装路线

1. 在自己的 Windows 电脑上，按 SideStore 官方步骤安装所需工具。
2. 使用数据线连接 iPhone，在手机上信任这台电脑。
3. 由你自己在正规安装工具里登录免费 Apple 账号，并安装 SideStore；不要将密码发到聊天或放入代码仓库。
4. 根据实际系统版本，完成开发者模式和 LocalDevVPN 设置。
5. 在 SideStore 中选择生成的 IPA，进行签名和安装。
6. 在“小小心意”的“小店设置”中填写自己的 QQ 邮箱授权码，保存后再由你决定是否真实发信。

SideStore 会尝试刷新免费的七天安装许可。刷新时需要联网并开启它要求的本机连接工具。自动刷新可能失败；到期后需要处理刷新或恢复安装。请勿先卸载，以免清除手机本地记录。

现有功能由手机本机运行：QQ 发信、照片、回忆、纪念日和生活记录不需要我们租用的服务器。两台设备的记录不会自动同步。

官方安装教程：<https://docs.sidestore.io/docs/installation/install>

官方要求和限制：<https://docs.sidestore.io/docs/faq>

## 免费云端编译

GitHub 为公开仓库提供免费的标准 Mac 执行环境；私有仓库使用账号自带的免费分钟和存储额度。具体额度以账号页面为准。需要先由用户选择仓库的公开/私有状态，并授权上传代码。

本工程的打包任务会在相关代码上传时自动启动，也可以手动启动；最长运行 40 分钟，打包结果保留 7 天。这 7 天是 GitHub 下载文件的保存期限，与手机安装许可的七天期限是两件不同的事。

上传到选定 GitHub 仓库后：

1. 打开仓库里的 **Actions**。
2. 选择 **Build iPhone IPA**。
3. 点击 **Run workflow** 开始编译。
4. 编译成功后，在 **Artifacts** 中下载 **little-love-ios-v1.0-unsigned**。
5. 解压下载的 ZIP，里面才是可交给 SideStore 的 IPA。

如果编译失败，不能把源码 ZIP 当作已经生成的安装包。需要根据 **iphone-build-log** 修正错误后重新打包。

GitHub 免费执行环境说明：<https://docs.github.com/en/actions/reference/runners/github-hosted-runners>

## 安装后的检查

请依次检查首次设置、退出重开、照片选择、备份导入/导出，以及由你自行触发的真实 QQ 邮件投递。编译通过并不等于已经完成这些手机上的验证。

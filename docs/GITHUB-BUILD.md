# 小小心意 · 免费苹果打包仓库

这个仓库用于免费的苹果云端打包，保存已授权公开的应用代码副本和打包文件。Gitee 仍是正式代码仓库。

目前 Gitee 仓库的匿名读取需要登录，云端 Mac 无法直接拉取，因此使用不含私人数据、邮箱授权码和签名密钥的代码副本。不会将 Gitee 登录凭据上传到公开仓库。

代码来源：<https://gitee.com/nefelibata_1_0/a-little-thoughtful-gift---app>

固定代码版本：`f28d80d10cebd29f01a3688fd50cb1bedd1c03c3`。

点击 Actions → Build iPhone IPA → Run workflow 启动。编译成功后下载 little-love-ios-v1.0-unsigned，解压取得 IPA，用自己的免费 Apple 账号通过 SideStore 签名安装。

仅使用 GitHub 的标准 Mac 打包环境，最长运行 40 分钟，不要求付费苹果会员。不会上传用户邮箱授权码、照片、记录或安卓签名密钥。

生成文件的名称为 little-love-ios-v1.0-unsigned.ipa。在 Actions 任务成功以前，不能将这个打包仓库或源代码 ZIP 当作已完成的苹果安装包。

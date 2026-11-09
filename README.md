# 薪刻 · Salary Clock

一个按北京时间实时计算「赚钱速度」和「今日累计收入」的交互式网页。纯静态、无构建步骤、无第三方依赖，可直接部署到 GitHub Pages。

## 功能

- **北京时间时钟**：无论访客身处哪个时区，都按 `Asia/Shanghai`（UTC+8）显示日期与时间，自动读取设备时钟，秒针实时走字。
- **计算按钮**：修改月薪、工作天数或上下班时间后，点击「更新计算 / 应用新设定」按钮，才会应用新数据并保存到本机。
- **赚钱速度**：根据月薪、每月平均工作天数、每天工作时间计算 `¥/min`。
- **今日累计**：
  - 上班前为 `0.00`；
  - 工作时段内按分钟线性增长，每到整分结算一次；
  - 下班后停在上限，不再增长。
- **进度条与状态**：展示今日工作进度，自动切换「尚未开工 / 正在赚钱 / 今日收工」。
- **输入校验**：点击计算时处理空值、负数、超过 31 天、下班早于上班等情况；校验失败会保留上一次有效结果。
- **本机记忆**：点击计算成功后，设定保存在浏览器 `localStorage`，刷新后恢复，不会上传。未点击计算就刷新时，仍使用上一次已应用的设定。
- **响应式**：适配桌面、平板和手机；支持减少动态效果的系统偏好。
- **本地直接打开**：使用普通脚本加载，不依赖 ES Module 或本地服务器，双击 `index.html` 也能完整运行。

## 计算方式

```text
每日分钟数 = 下班时间 − 上班时间
每分钟收入 = 月薪 ÷（每月工作天数 × 每日分钟数）
今日已赚   = 已工作分钟数 × 每分钟收入
今日上限   = 月薪 ÷ 每月工作天数
```

金额保留两位小数。工作时段按**当天同一日内**计算，暂不支持跨夜班。

## 文件

```text
index.html          页面结构
styles.css          样式与响应式布局
app.js              页面交互、时钟与渲染
salary.js           纯计算逻辑
favicon.svg         站点图标
tests/              单元测试与浏览器冒烟测试
screenshots/        桌面 / 手机预览截图
```

部署时只需要上传 `index.html`、`styles.css`、`app.js`、`salary.js`、`favicon.svg`。所有资源都使用相对路径，放在用户主页根目录或项目子路径下都可以。

## 本地预览

现在可以直接双击 `index.html` 打开，不需要服务器。如果更习惯通过 HTTP 预览，也可以：

```bash
python -m http.server 4173
```

然后打开 <http://127.0.0.1:4173/>。

## 测试

计算逻辑不依赖浏览器：

```bash
node tests/salary.test.mjs
```

浏览器冒烟测试需要先启动本地服务器，再以远程调试模式启动 Chrome：

```bash
chrome --headless=new --remote-debugging-port=9222 --user-data-dir=.chrome-test file:///E:/countSalary/index.html
node tests/ui-smoke.mjs
node tests/minute-tick.mjs
```

`ui-smoke.mjs` 会同时验证 `file://` 直接打开和 HTTP 访问两种方式；`minute-tick.mjs` 会等待真实的下一分钟，验证金额在整分时按速率增长。

## 部署到 GitHub Pages（自行操作）

**用户主页仓库** `https://github.com/<用户名>/<用户名>.github.io`：

1. 把上述 5 个静态文件放到仓库根目录；
2. 推送到 `main` 分支；
3. 在仓库 **Settings → Pages** 中选择 `Deploy from a branch`，分支 `main`、目录 `/ (root)`；
4. 等待 Pages 构建完成，访问 `https://<用户名>.github.io/`。

**普通项目仓库**：同样上传文件并开启 Pages；资源路径是相对的，因此会正常部署在 `https://<用户名>.github.io/<仓库名>/` 下。

本项目不使用 Jekyll 插件、不需要 Actions、不需要 Node 构建。

## 自定义

- 默认示例数据在 `app.js` 顶部的 `DEFAULTS` 中（月薪 12000、每月 21.75 天、09:00–18:00）。
- 主题色、字体与间距在 `styles.css` 顶部的 `:root` 变量中。
- 北京时间由访客设备时钟换算，不请求网络校时；设备时间不准时显示也会不准。

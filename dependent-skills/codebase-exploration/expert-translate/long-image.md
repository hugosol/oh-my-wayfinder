# 生成长图规格 — 手机竖屏阅读

翻译完成后,用户要求"生成长图/长图/导出图片"时启用,仅用于手机竖屏阅读。

## 版式(移动端)

对照 HTML 必须内置以下规则(直接写入 HTML 的 `<style>`,不要另建样式文件):

```css
@media (max-width: 800px) {
  body { padding: 1.5rem 1.15rem 4rem; }
  .row { grid-template-columns: 1fr; margin: 1.6rem 0; }
  .col-en {
    border-right: none;
    border-bottom: 1px solid #eee;
    padding-right: 0;
    padding-bottom: .7rem;
    margin-bottom: .5rem;
    font-size: 16.5px;
    line-height: 1.7;
    overflow-wrap: break-word;
  }
  .col-zh { font-size: 17.5px; line-height: 1.9; }
  h1 { font-size: 1.55rem; }
  .row.h2 { margin: 2rem 0 1.1rem; }
  .row.h2 h2 { font-size: 1.25rem; }
  .row.h3 { margin: 1.6rem 0 .9rem; }
  .row.h3 h3 { font-size: 1.08rem; }
  .note { font-size: .88em; }
}
code { overflow-wrap: anywhere; }
```

效果:单栏堆叠,每段原文在上、译文在下;标题层级、列表、引用、译注结构不变。

## 渲染

- 视口:375 × 812(手机竖屏逻辑宽度),deviceScaleFactor = 2 → 输出 750px 宽,文字为真实尺寸
- 用 headless 浏览器打开本地 HTML,`page.screenshot({ fullPage: true })` 整页截图禁用——页面超过约 16384 设备像素高时,Chromium 整页合成会出错,下半部分内容错乱/重复(实测过)。改用分块捕获:
  - 按 800 CSS px 高的块,逐块 `window.scrollTo` 滚动、等待约 250ms 让内容完成光栅化,再 `page.screenshot({ clip: { x: 0, y, width: 375, height: h } })`,h 为每块实际高度(最后一块取余数)
  - 各块直接保存为临时 PNG,再用 System.Drawing(PowerShell)按顺序逐块整数坐标粘贴拼接
- 不要用 silent/缩略图模式——那只输出低分辨率预览
- 拼接后保存为 PNG 到当前目录,文件名与 HTML 同名(扩展名 .png)

## 完成标准(全部满足才算完成)

- 截图前确认 `document.documentElement.scrollWidth == clientWidth`(无横向溢出)
- PNG 宽 = 750,高 = 页面 scrollHeight × 2(无截断)
- 分块无重叠无遗漏:各块高度之和 × 2 = PNG 高
- 抽查若干文字稠密行做偏移扫描,任意两行像素完全一致的匹配率远低于 1.0(无内容重复)
- 图中最后一段与译文末段一致
- PNG 已保存到当前目录

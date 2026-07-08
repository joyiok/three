---
name: verify
description: 在无头 Chrome 里驱动本项目（Vite + Canvas 塔防游戏）验证改动
---

# 验证方式

纯前端 Canvas 游戏，无 Playwright 依赖。用系统 Chrome + CDP（Node 22 内置 WebSocket）驱动。

## 启动

```bash
npx vite --port 5199 &   # dev server
google-chrome --headless=new --remote-debugging-port=9666 --no-sandbox \
  --window-size=480,860 --user-data-dir=$(mktemp -d) about:blank &
```

## 驱动要点

- CDP 客户端：`fetch http://localhost:9666/json/list` 拿 `webSocketDebuggerUrl`，
  `Runtime.evaluate` 执行 JS、`Page.captureScreenshot` 截图、
  `Input.dispatchMouseEvent`（mousePressed/mouseMoved/mouseReleased）做真实拖放
  （游戏用 Pointer Events + setPointerCapture，合成事件不行，必须走 Input 域）。
- 菜单按钮文字带空格（"战 役"），用类选择器：`.menu-campaign`、`.menu-versus`；
  选关卡片是 `.lv-card`（div 不是 button）。
- 对局内 DOM 锚点：`[data-food] [data-hp] [data-cost] [data-recruit] .wave-btn
  .wave-preview [data-slot="N"] [data-canvas]`；锦囊道具栏 `.item-bar .item-btn
  .item-empty`（瞄准态按钮带 `.item-armed`）；对战道具 `[data-dock-p1] .vs-item`。
- dev server 下暴露调试句柄：战役 `window.__engine`（Engine，含 `.gs`），对战
  `window.__versus`（VersusGame）。可直接塞士兵/道具/粮食构造场景。
- 画布格子：宽度/7 为格宽，格 (x,y) 中心 = canvasRect + (x+0.5, y+0.5)×cell。
- 部署：从 `[data-slot="0"]` 中心拖到画布草地格中心；成功后槽位 textContent 变空。

## 值得驱动的流程

菜单→选关→进局；征兵（粮扣减+涨价）；拖放部署/合成；开波按钮（休整期含
+N🍚 奖励与倒计时）；打完一波看波末利息/屯田飘字与预告刷新。

## 陷阱

- 监听 `Runtime.consoleAPICalled`(error) 与 `Runtime.exceptionThrown` 抓页面报错。
- 页面失焦自动暂停（visibilitychange）——无头模式不受影响，但别最小化有头窗口。

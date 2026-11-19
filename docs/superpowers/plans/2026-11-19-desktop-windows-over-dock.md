# Desktop 应用窗口可拖入 Dock 区域

## 要保住的旧行为

- 桌面应用窗口仍可拖动、调整大小、置顶、最小化、最大化和关闭。
- 未最大化时 Dock 保持常显；最大化窗口时 Dock 仍按原逻辑隐藏并可从屏幕底边唤出。
- Dock 按钮可点击、键盘可聚焦，应用窗口层级仍低于 Dock。
- 拖动窗口保持完整宽度约束，且标题栏仍留在桌面可视区域内。

## 架构

| 职责 | 文件 |
|---|---|
| 普通窗口拖动时允许覆盖 Dock 区域 | `src/components/desktop/DesktopAppWindow.tsx` |
| 窗口可见区域边界计算（纯逻辑） | `src/lib/desktopWindowFrame.ts` |
| Dock 透明度与桌面窗口溢出 | `src/styles/desktop.css` |
| 拖动穿入 Dock 且 Dock 仍在上层的回归 | `e2e/host-desktop.spec.ts` |
| 窗口边界函数回归 | `src/lib/desktopWindowFrame.test.ts` |
| 功能测试映射 | `docs/TEST_MATRIX.md` |

窗口继续 portal 到 Desktop surface；surface 允许窗口视觉溢出，外层 stage 裁剪到桌面范围，Dock 使用更高层级覆盖窗口。拖动边界由 surface 与 stage 的可见底边差计算，不改最大化窗口和 store 结构。

## 设计

- 未最大化窗口可向下拖进 Dock 的矩形区域，Dock 图标底板始终绘制在窗口上方；窗口不会越出 Desktop stage。
- Dock 底板采用更高透明度的半透明颜色和背景模糊，图标和 hover 标签保持可辨识。
- 加载、空状态和连接错误表现不变；不增加新提示文案。

## 任务

### 任务 1：窗口拖动和 Dock 半透明

- [x] 先添加纯逻辑和 E2E 回归：窗口可进入 Dock 区域、标题栏仍在 stage 内、Dock 覆盖窗口且背景 alpha 小于 0.8。
- [x] 运行新增 E2E 确认当前行为失败。
- [x] 调整拖动边界和 surface overflow；提高 Dock 半透明效果。
- [x] 运行 Desktop 窗口和 Dock 定向 E2E。

### 任务 2：验证和交付

- [x] 更新测试矩阵；运行硬编码禁检、smoke 和全量测试。
- [ ] 提交并推送 `main`。

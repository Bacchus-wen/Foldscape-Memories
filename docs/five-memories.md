# 五个案例与模型入口

当前照片列表只保留以下五项，移除末尾三张花卉示例的页面入口。示例源文件没有物理删除。

| 照片 | 案例 ID | 模型 |
| --- | --- | --- |
| The lighthouse | lighthouse | /scenes/lighthouse/lighthouse-memory-v2.glb |
| Scarlet sails | iceberg | /scenes/iceberg/iceberg-memory.glb |
| A quieter place | coastal-house | /scenes/coastal-house/coastal-house-memory.glb |
| Blue over white | santorini | /scenes/santorini/santorini-memory.glb |
| Crown of Osaka | osaka-castle | /scenes/osaka-castle/osaka-castle-memory.glb |

选择照片后点击 Open memory。照片处于迁移中段或模型仍在加载时，按钮接受打开请求：先让当前选中照片抵达设备，等待对应模型准备完成，再开始展开。请求保留选中索引，不再重置回第一个灯塔。等待过程中防止重复提交；倒带和现有模型查看手势保留。

验证：67 项测试通过，含五份 GLB 解析/安装与折叠检查、实际 React 组件输出中的五个照片入口、所有案例 Open memory 按钮、照片迁移期间继续浏览。五个模型 HTTP HEAD 均为 200、Content-Type=model/gltf-binary。构建成功，本地预览返回 index-C5gq25Sw.js。

浏览器自动化连接仍不可用，因此未声称完成五个案例的浏览器视觉复测。

# 3D 模型预览器 / 3D Model Previewer

此模块从 `2.0.0-alpha.4` 起包含在 Windows 安装包中。打开单个模型或目录后，可在左侧切换模型。支持 GLB、GLTF、FBX、OBJ/MTL、STL；GLTF 的 `.bin`、贴图及 OBJ 的 MTL 和贴图应放在所选文件夹内。模型、动画与贴图不会上传；不自动获取网络资源。

拖动旋转、滚轮缩放、右键平移。右侧可切换材质 / 线框 / 法线渲染、照明和网格，查看尺寸、顶点、三角面、网格及骨骼数量。动画下拉播放模型自带的动画片段。两点测距显示**模型单位**，不承诺真实米数：不同来源的模型可能使用不同缩放。再次点击模型可开始新一组测量。

MP4 导出使用已有的 FFmpeg 配置：最长 10 秒、24/30 FPS、长边 720 像素。有动画时录制选中的动画；没有选中动画时录制一圈转台旋转。单文件上限 256 MB，目录总量上限 1 GB，配套资源上限 256 MB / 1000 个文件。不支持原生 `.blend`、CAD、Unity 工程文件，也不保证每个 FBX 变体的材质与动画都能完整还原。

The 3D viewer is included in the Windows installer starting with `2.0.0-alpha.4`. Open one model or a directory to inspect GLB, GLTF, FBX, OBJ/MTL and STL. Keep external GLTF buffers/textures and OBJ materials/textures within the selected folder. Assets stay local; remote dependencies are not fetched.

Drag to orbit, scroll to zoom and right-drag to pan. Inspect shaded, wireframe and normal rendering, lighting, model dimensions, mesh counts and built-in animation clips. Two-point measurements use **model units**, which may not be metres. MP4 export reuses the configured FFmpeg executable and is limited to 10 seconds at 24/30 FPS with a 720-pixel long edge. Without a selected animation, the export rotates the model once. Native Blender, CAD and Unity project formats are outside this module's scope; FBX variants may differ in material and animation support.

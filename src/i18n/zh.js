window.SITE_I18N = window.SITE_I18N || {};

// 文案统一维护在这里；页面结构请修改 index.html。
window.SITE_I18N.zh = {
  page_title: '空间智能创新中心 - 空间智能基础设施',
  hero_canvas_aria_label: '3D 粒子地球',
  brand_main: '空间智能创新中心',
  brand_suffix: '',
  nav_about: '关于我们',
  nav_scenarios: '应用场景',
  nav_vision: '具身终端',
  nav_contact: '合作联系',
  hero_title: '看见世界<br><span class="gradient-text-blue">认识世界</span><br><span class="gradient-text">走遍世界</span>',
  hero_subtitle: '飞渡空间智能构建从物理世界感知到3D生成的全栈技术，赋能智能仿真与下一代人机交互，提供它们真正需要的训练数据。',
  hero_cta_tech: '探索技术',
  hero_cta_demo: '互动演示',

  // Narrative
  narrative_text: '世界是<strong>空间与物理的集合</strong>。<br>读懂空间，掌握规律，才能做出<em>预测与决策</em>。<br><br><span style="font-size:clamp(18px,2.4vw,30px);font-weight:600;color:var(--white)">我们用<strong>生成的世界</strong>，训练走遍世界的智能体。</span>',

  manifesto: '我们用<span style="color:var(--cyan)">生成的世界</span>，<br>训练<span style="background:linear-gradient(135deg,var(--cyan),var(--amber));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">走遍世界</span>的智能体。',

  // Three Words Strip
  tw1_num: '01 · 看见', tw1_zh: '看见世界', tw1_en: '空间感知', tw1_stat_val: '厘米级', tw1_stat_lbl: '重建精度',
  tw2_num: '02 · 认识', tw2_zh: '认识世界', tw2_en: '空间认知', tw2_stat_val: '10亿+', tw2_stat_lbl: '参数规模',
  tw3_num: '03 · 走遍', tw3_zh: '走遍世界', tw3_en: '空间行动', tw3_stat_val: '实时',   tw3_stat_lbl: '3D生成',
  tw_desc_1: '构建物理世界的高精度数字模型，还原材质、结构、热学属性，让机器从像素读懂现实。',
  tw_desc_2: '超越图像识别的三维空间感知，火势、水位、建筑结构，世界的每一个细节都清晰可见。',
  tw_desc_3: '从感知到仿真到决策，理解物理规律，推演未来状态，生成可执行的行动方案。',

  // Scenarios
  tag_scenarios: '应用场景',
  scenarios_title: '六大落地场景',
  scenarios_lead: '从城市消防到国防决策，六大场景共享同一套高保真空间仿真与具身智能训练数据底座。',
  sc1_tag: '火灾救援',  sc1_title: '建筑 + 火灾',      sc1_desc: '生成建筑内部火势蔓延、烟雾扩散的物理仿真数据，训练消防无人机与应急机器人的自主决策能力。',   sc1_f1: '火势仿真',   sc1_f2: '烟雾识别',   sc1_f3: '应急规划',
  sc2_tag: '洪涝防控',  sc2_title: '堤坝 + 水利',      sc2_desc: '浪高、水位、流速、淹没面积，物理精确的水文仿真，为防洪巡检无人机提供完整训练环境。',           sc2_f1: '水文推演',   sc2_f2: '淹没预测',   sc2_f3: '调度规划',
  sc3_tag: '国防安全',  sc3_title: '国防',              sc3_desc: '物理参数、力学属性、爆破仿真，在数字世界中训练自主无人系统，实现威胁识别与态势研判。',           sc3_f1: '物理仿真',   sc3_f2: '爆破模拟',   sc3_f3: '威胁分析',
  sc4_tag: '智慧农业',  sc4_title: '农业',              sc4_desc: '树种识别、产量计算、作物空间规划，空间数据赋能农业无人机实现真正的自主化精细作业。',             sc4_f1: '树种识别',   sc4_f2: '产量计算',   sc4_f3: '路径规划',
  sc5_tag: '自主系统',  sc5_title: '车辆 / 工事 + 环境', sc5_desc: '材质识别、发射率感知、热能辐射仿真，助力自动驾驶与工程机器人在复杂环境下的精准决策。',         sc5_f1: '热能辐射',   sc5_f2: '目标定位',   sc5_f3: '合成数据集',
  sc6_tag: '文旅文保',  sc6_title: '文旅 + 文保',       sc6_desc: '裂痕识别、损毁评估、风格化视频生成，空间智能为文物保护与沉浸式文旅带来全新可能。',             sc6_f1: '损毁识别',   sc6_f2: '风格生成',   sc6_f3: '自主巡检',
  foundation_label: '训练底座',
  foundation_title: '具身智能训练数据',
  foundation_desc: '它不是单独的落地场景，而是贯穿上述六大场景的共用底层能力。飞渡将城市、自然、工业环境的高保真空间仿真数据，直接转化为可用于具身智能训练的标注数据集，补齐真实世界物理感知数据的根本缺口。',

  // Solution Pipeline
  tag_pipeline: '技术管线',
  pipeline_h2: '看见 · 看懂 · 可算 · 可判',
  pipeline_lead: '一条从真实世界到行动决策的数据流水线，输入一张现实图像，输出可执行的智能方案。',
  pipe1_badge: '空间建模', pipe1_sub: '看见', pipe1_title: '空间建模', pipe1_desc: '构建物理世界高精度数字模型，还原材质、结构与热学属性。',
  pipe2_badge: '空间理解', pipe2_sub: '看懂', pipe2_title: '空间理解', pipe2_desc: '解析流场、热场、力学分布，物理参数精确识别。',
  pipe3_badge: '空间仿真', pipe3_sub: '可算', pipe3_title: '空间仿真', pipe3_desc: '烟雾扩散、热辐射、流体推演，物理规律精确还原。',
  pipe4_badge: '空间决策', pipe4_sub: '可判', pipe4_title: '空间决策', pipe4_desc: '生成行动路径与调度方案，从仿真直达执行指令。',

  // Embodied Carriers
  tag_embodied: '具身载体',
  vision_h2: '具身终端载体',
  vision_lead: '飞渡的空间数据天然适配所有需要在物理世界中自主行动的智能终端，无论是天空、地面还是特殊环境。',
  carrier1_title: '无人机',     carrier1_desc: '物流、巡检、国防、农业，最成熟的落地平台，飞渡数据直接适配',
  carrier2_title: '遥感卫星',   carrier2_desc: '宏观空间数据采集与分析，与飞渡生成模型深度融合',
  carrier3_title: 'AR 智能眼镜', carrier3_desc: '人机协同的空间理解界面，实时叠加空间决策层',
  carrier4_title: '机器狗',     carrier4_desc: '复杂地形自主巡逻与作业，最需要物理仿真训练数据的终端',

  // CTA
  tag_collaborate: '合作联系',
  cta_heading: '用生成的世界，<br>训练<span style="color:var(--cyan)">认识世界</span>的智能体',
  cta_lead: '无论你是无人机企业、机器人研发团队、国防科研机构还是自主系统实验室，飞渡的空间数据与仿真能力，是你最需要的训练基础设施。',
  cta_btn_primary: '峥嵘大模型',
  cta_btn_secondary: '了解技术方案',

  // About page
  about_page_title: '关于我们 — 空间智能创新中心',
  about_heading: '关于我们',
  about_body: '我们是一群深耕空间智能的工程师与研究者。我们构建从物理世界感知到三维生成的全栈技术，为无人机、机器人与自主系统提供高保真仿真训练数据，驱动下一代具身智能走遍真实世界。',

  // Footer
  footer_main: '飞渡科技 © 2025 &nbsp;·&nbsp; 空间智能',
  footer_tagline: '解构 · 看见 · 理解',
};

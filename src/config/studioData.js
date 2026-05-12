export const TRANSLATIONS = {
  en: {
    nav: { product: 'Product Shot', retouch: 'AI Retouch', portrait: 'Portrait', soon: 'Coming Soon' },
    auth: {
      login: 'Log In', logout: 'Log Out', submit: 'Sign In', welcome: 'Welcome',
      productName: 'OG AI',
      subtitle: 'Professional AI Photography',
      tabPassword: 'Account Login', tabPhone: 'Phone Login',
      username: 'Username', password: 'Password',
      placeholderUsername: 'Enter username',
      placeholderPassword: 'Enter password',
      phone: 'Phone Number', code: 'Verification Code',
      placeholderPhone: 'Enter your phone number',
      placeholderCode: 'Enter 6-digit code',
      sendCode: 'Get Code', sending: 'Sending...', resend: 'Resend',
      slideToVerify: 'Slide to verify', verified: 'Verified',
      inviteCode: 'Invite Code', placeholderInviteCode: 'Enter invite code for 50 bonus credits (optional)'
    },
    upload: { title: 'Reference Images', desc: 'Upload', uploaded: 'Ready', uploading: '...', change: 'Change' },
    prompt: { label: 'Creative Prompt', placeholder: 'Describe materials, lighting, and mood...', enhance: 'AI Enhance', enhancing: 'Optimizing...' },
    styles: { Luxurious: 'Luxurious', Minimal: 'Minimal', Nature: 'Nature', Cyberpunk: 'Cyberpunk', Studio: 'Studio', Soft: 'Soft', Vintage: 'Vintage', Cinematic: 'Cinematic', Neon: 'Neon' },
    template: 'Reference Templates',
    resolution: 'Output Size', ratio: 'Aspect Ratio',
    generate: { idle: 'Generate', loading: 'Creating...', disabled: 'Upload Image First', loginRequired: 'Login to Create', quotaEmpty: 'Quota Exceeded' },
    status: { ready: 'OG AI Ready', powered: 'Powered by TT-API', generating: 'Creating your masterpiece...', failed: 'Generation Failed' },
    gallery: { title: 'History', empty: 'No creations yet' },
    quota: 'Credits',
    toast: { copySuccess: 'Copied!', copyFail: 'Copy Failed', downloadFail: 'Download Failed', downloadSuccess: 'Downloaded!', httpsRequired: 'Copy requires HTTPS' },
    actions: { download: 'Download', fullscreen: 'Fullscreen', copy: 'Copy Image' }
  },
  zh: {
    nav: { product: '商品摄影', retouch: '智能修图', portrait: '个人写真', soon: '敬请期待' },
    auth: {
      login: '登录 / 注册', logout: '退出登录', submit: '登录 / 注册', welcome: '欢迎回来',
      productName: 'OG AI',
      subtitle: '专业 AI 商品摄影工坊',
      tabPassword: '账号登录', tabPhone: '手机登录',
      username: '用户名', password: '密码',
      placeholderUsername: '请输入用户名',
      placeholderPassword: '请输入密码',
      phone: '手机号', code: '验证码',
      placeholderPhone: '请输入手机号',
      placeholderCode: '请输入6位验证码',
      sendCode: '获取验证码', sending: '发送中...', resend: '重新获取',
      slideToVerify: '拖动滑块完成验证', verified: '验证通过',
      inviteCode: '邀请码', placeholderInviteCode: '填写邀请码可获赠50积分（选填）'
    },
    upload: { title: '参考图', desc: '上传参考图', uploaded: '已就绪', uploading: '上传中...', change: '更换' },
    prompt: { label: '创意描述', placeholder: '描述材质、光影氛围、背景细节...', enhance: 'AI 润色', enhancing: '优化中...' },
    styles: { Luxurious: '奢华质感', Minimal: '极简白底', Nature: '自然森系', Cyberpunk: '赛博朋克', Studio: '专业影棚', Soft: '柔和光影', Vintage: '复古胶片', Cinematic: '电影大片', Neon: '霓虹光效' },
    template: '参考模版',
    resolution: '输出画质', ratio: '画幅比例',
    generate: { idle: '立即生成', loading: '任务提交中...', disabled: '请先上传图片', loginRequired: '请登录后使用', quotaEmpty: '配额已用尽' },
    status: { ready: 'OG AI 就绪', powered: '由 TT-API 驱动', generating: '正在精心绘制中...', failed: '生成失败' },
    gallery: { title: '创作记录', empty: '暂无历史记录' },
    quota: '剩余点数',
    toast: { copySuccess: '已复制到剪贴板', copyFail: '复制失败', downloadFail: '下载失败', downloadSuccess: '下载成功', httpsRequired: '复制功能需要 HTTPS 安全协议' },
    actions: { download: '下载图片', fullscreen: '全屏查看', copy: '复制图片' }
  }
};

export const TEMPLATES = [
  {
    id: 'storyboard',
    name: { zh: '3X3故事板', en: '3x3 Storyboard' },
    image: 'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/3x3.png',
    prompt: '为高端{{家具}}电商广告制作一张 3×3 的写实风格故事板联系表，广告中仅包含以下产品： {{主产品}}和{{辅助产品}}\n背景{{背景}} \n照明{{照明}} \n生成一个等间距的 3×3 网格。'
  },
  {
    id: 'frozen',
    name: { zh: '冰爽优雅', en: 'Frozen Elegance' },
    image: 'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/%E5%86%B0%E7%88%BD.jpeg',
    prompt: '想象一下这样的视觉概念：[产品名称]（标签上印有{{}}文字）悬浮在一块裂纹遍布的超透明冰块中。产品清晰可见，周围环绕着一层薄霜。它静置于光滑的白色丝绸之上，环境灯光冷峻而优雅，光影在丝绸表面跳跃闪烁。请以奢华的韩国护肤品广告风格，用丰富的视觉细节描绘整个场景。'
  },
  {
    id: 'brand',
    name: { zh: '品牌设计', en: 'Brand Design' },
    image: 'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/pinpai.png',
    prompt: 'Create a vertical 9:16 brand design guide poster using the uploaded product image. Adapt the design style to match the product\'s niche and visual identity. Structure the poster with clear, elegant sections: (1) Large logo display and safe zone usage, (2) Product mockup centered and highlighted, (3) Primary and secondary color palette swatches with hex codes, (4) Typography guide with heading, subheading, body font samples, and line spacing specs, (5) Iconography or graphic motif examples used by the brand, (6) Image treatment style with sample lifestyle or studio visuals, (7) Grid system or layout rules, (8) Packaging mockups and surface applications, (9) Do\'s & Don\'ts with annotated visuals. Use minimalist white or soft neutral background with structured layout dividers and drop shadows. The result must be visually rich, clean, and suitable for a printed or digital brand book.'
  },
  {
    id: 'food',
    name: { zh: '食品海报', en: 'Food Poster' },
    image: 'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/%E9%A3%9F%E5%93%81.jpeg',
    prompt: 'A 2:3 aspect ratio, vertical, high-resolution food advertisement showcasing the most representative and delicious product from the uploaded reference image. The product is centered and enhanced with mouthwatering details such as melting cheese, dripping chocolate, whipped cream, or condensed moisture. The background should use a gradient or soft color scheme consistent with the brand image. A slogan aligned with the brand style should be prominently displayed at the top. The official brand logo should be included at the bottom. Utilize cinematic studio lighting, soft shadows, and ultra-clear textures to create a visually impactful yet minimalist poster.'
  },
  {
    id: 'glass',
    name: { zh: '拟态玻璃', en: 'Glass Morph' },
    image: 'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/%E6%8B%9F%E6%80%81%E7%8E%BB%E7%92%83.jpeg',
    prompt: '[产品名称] in a surreal, minimalist paper-glass style advertisement.\nThe product is centered, crafted from translucent frosted glass-paper, placed against a clean white or softly tinted background.\nSoft cinematic lighting creates gentle contrast and ambient shadows.\nA single brand color subtly interacts with the scene through glow, mist, liquid, or foam.\nInclude a bold, elegant 4-word slogan near the product.\nThe brand logo appears subtly etched, glowing, or printed in a refined manner.\nVertical or square aspect ratio, ultra-detailed, poster-quality, visually soothing and conceptually refined.'
  },
  {
    id: 'sky',
    name: { zh: '从天而降', en: 'Sky Drop' },
    image: 'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/%E5%A4%A9.png',
    prompt: '创作一张比例为 1:1 的图片\n一张梦幻般的品牌广告，广告主角是 [品牌名称]。广告中，品牌设计了一个泡泡状的胶囊，胶囊内装着品牌专属颜色的降落伞包装，包装盒内是他们的经典产品。背景是蓝天、模糊的降落伞包装、白云，顶部有一个小小的品牌标志，下方是一句简洁的标语。广告采用电影级的日光照明，并运用了镜头光晕、景深和 HDR 技术。'
  },
  {
    id: 'planet',
    name: { zh: '品牌星球', en: 'Brand Planet' },
    image: 'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/mac%20book%20word.png',
    prompt: 'Planet [产品名称], Year 3025. A distant world shaped entirely by the essence of the brand. The landscapes echo its core identity — from surreal terrains to fantastical weather patterns. Native flora and fauna embody its signature ingredients and aesthetics. Rivers flow with iconic flavors. Architecture is inspired by its packaging and visual language, fused with futuristic technology. The atmosphere is rich in texture, cinematic lighting, and surreal detail. A dreamlike vision of brand identity reimagined as a sci-fi utopia.'
  }
];

export const PORTRAIT_TEMPLATES = [
  'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/model/ScreenShot_2025-12-11_204825_350.png',
  'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/model/ScreenShot_2025-12-11_204545_252.png',
  'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/model/ScreenShot_2025-12-11_204511_359.png',
  'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/model/ScreenShot_2025-12-11_204428_924.png',
  'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/model/ScreenShot_2025-12-11_204310_957.png',
  'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/model/ScreenShot_2025-12-11_204209_146.png',
  'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/model/ScreenShot_2025-12-11_204129_497.png',
  'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/model/ScreenShot_2025-12-11_204100_675.png',
  'https://ai-shot.oss-cn-hangzhou.aliyuncs.com/model/704.jpeg'
];

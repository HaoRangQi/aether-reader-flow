/**
 * @fileoverview UI string dictionary for supported locales.
 *
 * Design:
 *   - Two locales: `zh` (default, 简体中文) and `en` (English)
 *   - One flat map per locale — no nested namespaces, easier to grep
 *   - All keys exist in both locales; TypeScript enforces this via the
 *     `Dict` type. Missing keys cause a compile error.
 *
 * Adding a new locale:
 *   1. Add the language code to `Locale`
 *   2. Add a new entry in `DICTS` of the same shape
 *   3. Update `detectBrowserLocale()` if needed
 *
 * Adding a new string:
 *   1. Add key + zh translation to `DICTS.zh`
 *   2. Add same key to every other locale (TS will complain if you forget)
 *   3. Call `t('key')` from components via `useT()`
 */

/** Two-letter language code. */
export type Locale = 'zh' | 'en';

export const SUPPORTED_LOCALES: Locale[] = ['zh', 'en'];

/** Human-readable label for the language picker. */
export const LOCALE_LABEL: Record<Locale, string> = {
  zh: '简体中文',
  en: 'English',
};

/**
 * The canonical string dictionary. The `zh` map is the source of truth;
 * `en` must keep all the same keys.
 */
const zh = {
  // Library
  'library.title': '书架',
  'library.empty.title': '书架还是空的',
  'library.empty.description':
    '上传你的第一本书（PDF 或 EPUB），让 AI 陪你读懂。每一次提问、每一次验证，都会被记录到你的思考文档里。',
  'library.upload': '上传书籍',
  'library.chapters': '章',
  'library.pages': '页',
  'library.export': '导出',
  'library.back': '返回书架',
  'library.settings': '设置',
  'library.reading.at': '读到 {chapter}',
  'library.reading.recent': '最近阅读 {time}',
  'time.justNow': '刚刚',
  'time.minutesAgo': '{count} 分钟前',
  'time.hoursAgo': '{count} 小时前',
  'time.daysAgo': '{count} 天前',

  // Upload dialog
  'upload.title': '上传书籍',
  'upload.description':
    '支持 PDF、EPUB 与 TXT。EPUB 章节结构基于 spine 自动识别，效果通常优于 PDF。',
  'upload.dropzone': '点击选择文件，或拖拽多个文件到这里',
  'upload.formats': '.pdf · .epub · .txt · 最大 500MB',
  'upload.close': '关闭',
  'upload.parsing': '正在解析',
  'upload.done': '完成',
  'upload.error.empty': '文件是空的',
  'upload.error.unrecognized': '无法识别这个文件',
  'upload.error.tooLarge': '文件超出 {limit} MB 限制（当前 {size} MB）',
  'upload.error.unsupported':
    '暂不支持「{name}」。当前仅接受 PDF (.pdf)、EPUB (.epub) 与 TXT (.txt)',
  'upload.failed': '上传失败',

  // Reader
  'reader.selectChapter': '请在左侧选择一个章节',
  'reader.chapterPrefix': '第',
  'reader.chapterSuffix': '章',
  'reader.pages': '第 {start}–{end} 页',
  'reader.toolbar.summary': '章节总结',
  'reader.toolbar.chat': 'AI 对话',
  'reader.toolbar.timeline': '时间轴',
  'reader.toolbar.unlock': '解锁 AI',
  'reader.toolbar.unlocked': '已解锁',

  // AI Sidebar
  'ai.title': 'AI 对话',
  'ai.placeholderAnchor': '基于上面的原文继续追问',
  'ai.placeholderEmpty': '问我任何关于这本书的问题',
  'ai.input.placeholder': '追问…',
  'ai.input.send': '发送',
  'ai.input.hint': 'Enter 发送 · Shift+Enter 换行',
  'ai.error': '[出错]',
  'ai.close': '关闭对话',

  // Selection popover
  'popover.translate': '翻译',
  'popover.explain': '解释',
  'popover.verify': '验证',
  'popover.deep': '深入',
  'popover.generating': '生成中…',
  'popover.close': '关闭',

  // Summary panel
  'summary.title': '章节总结',
  'summary.generate': '生成本章总结',
  'summary.generating': '正在生成…',
  'summary.regenerate': '重新生成',
  'summary.corePoints': '核心论点',
  'summary.keyConcepts': '关键概念',
  'summary.argumentFlow': '论证逻辑',
  'summary.openQuestions': '章末思考',

  // Timeline
  'timeline.title': '时间轴',
  'timeline.search': '搜索原文 / AI 回答 / 提问…',
  'timeline.allChapters': '全部章节',
  'timeline.empty.unfiltered': '开始划词，AI 会陪你读懂',
  'timeline.empty.filtered': '没有匹配的条目',
  'timeline.type.translate': '翻译',
  'timeline.type.explain': '解释',
  'timeline.type.verify': '验证',
  'timeline.type.summarize': '总结',
  'timeline.type.chat': '对话',
  'timeline.question': '问：',

  // Export dialog
  'export.title': '导出思考文档',
  'export.format': '格式',
  'export.format.markdown': 'Markdown',
  'export.format.html': 'HTML',
  'export.range': '范围',
  'export.allChapters': '全部章节',
  'export.cancel': '取消',
  'export.confirm': '导出',
  'export.generating': '生成中…',
  'export.error': '导出失败',

  // Settings
  'settings.title': '设置',
  'settings.section.models': '模型服务',
  'settings.section.routing': '任务路由',
  'settings.section.budget': '成本预算',
  'settings.section.theme': '外观主题',
  'settings.section.font': '阅读偏好',
  'settings.section.language': '语言',
  'settings.section.storage': '存储状态',
  'settings.section.selection': '划词气泡',
  'settings.section.prompts': '提示词',

  'settings.selection.title': '划词气泡',
  'settings.selection.description': '控制划词气泡和 AI 结果面板的外观。颜色留空则跟随当前主题。',
  'settings.selection.bubbleBg': '气泡背景色',
  'settings.selection.bubbleText': '气泡文字色',
  'settings.selection.bubbleAccent': '按钮强调色',
  'settings.selection.resultWidth': 'AI 结果面板宽度',
  'settings.selection.resultWidth.compact': '紧凑（280px）',
  'settings.selection.resultWidth.normal': '标准（400px）',
  'settings.selection.resultWidth.wide': '宽屏（560px）',
  'settings.selection.colorPlaceholder': '留空跟随主题',
  'settings.selection.reset': '恢复默认',
  'settings.selection.saved': '✓ 已保存',

  'settings.language.title': '语言',
  'settings.language.description':
    '应用界面语言。默认跟随浏览器，手动选择后会被记住。',
  'settings.language.auto': '跟随浏览器',

  'settings.theme.title': '外观主题',
  'settings.theme.description': '每个主题包含浅色与深色两套配色，模式可独立切换。',
  'settings.theme.packs': '主题包',
  'settings.theme.mode': '模式',
  'settings.theme.mode.light': '浅色',
  'settings.theme.mode.dark': '深色',
  'settings.theme.mode.auto': '跟随系统',

  'settings.budget.title': '成本预算',
  'settings.budget.description':
    '设置月度 AI 调用预算（人民币）。达到 80% / 100% 会有提醒，不会强制中断。',
  'settings.budget.unit': '/ 月',
  'settings.budget.save': '保存',
  'settings.budget.saved': '✓ 已保存',
  'settings.budget.hint':
    '参考：一本 30 万字金融科普书约消耗 ¥180–300（具体取决于模型与使用强度）。',

  // Generic
  'common.loading': '加载中…',
  'common.save': '保存',
  'common.cancel': '取消',
  'common.close': '关闭',
  'common.delete': '删除',
  'common.edit': '编辑',
  'common.confirm': '确认',
};

/** TS will require any other locale to have the same set of keys. */
export type Dict = typeof zh;

const en: Dict = {
  // Library
  'library.title': 'Library',
  'library.empty.title': 'Your shelf is empty',
  'library.empty.description':
    'Upload your first book (PDF or EPUB) and let AI help you read it. Every question and every fact-check is logged into your thinking document.',
  'library.upload': 'Upload book',
  'library.chapters': 'chapters',
  'library.pages': 'pages',
  'library.export': 'Export',
  'library.back': '← Library',
  'library.settings': 'Settings',
  'library.reading.at': 'At {chapter}',
  'library.reading.recent': 'Read {time}',
  'time.justNow': 'just now',
  'time.minutesAgo': '{count} min ago',
  'time.hoursAgo': '{count} hr ago',
  'time.daysAgo': '{count} days ago',

  // Upload dialog
  'upload.title': 'Upload a book',
  'upload.description':
    'Accepts PDF, EPUB, and TXT. EPUB chapter structure is detected automatically from the spine; typically better than PDF.',
  'upload.dropzone': 'Click to choose files, or drag multiple files here',
  'upload.formats': '.pdf · .epub · .txt · max 500MB',
  'upload.close': 'Close',
  'upload.parsing': 'Parsing',
  'upload.done': 'Done',
  'upload.error.empty': 'File is empty',
  'upload.error.unrecognized': 'Cannot recognize this file',
  'upload.error.tooLarge': 'File exceeds {limit} MB limit (got {size} MB)',
  'upload.error.unsupported':
    'Unsupported file "{name}". Only PDF (.pdf), EPUB (.epub), and TXT (.txt) are accepted.',
  'upload.failed': 'Upload failed',

  // Reader
  'reader.selectChapter': 'Pick a chapter from the left',
  'reader.chapterPrefix': 'Chapter',
  'reader.chapterSuffix': '',
  'reader.pages': 'pp. {start}–{end}',
  'reader.toolbar.summary': 'Summary',
  'reader.toolbar.chat': 'AI chat',
  'reader.toolbar.timeline': 'Timeline',
  'reader.toolbar.unlock': 'Unlock AI',
  'reader.toolbar.unlocked': 'Unlocked',

  // AI Sidebar
  'ai.title': 'AI chat',
  'ai.placeholderAnchor': 'Follow up on the highlighted passage',
  'ai.placeholderEmpty': 'Ask anything about this book',
  'ai.input.placeholder': 'Ask…',
  'ai.input.send': 'Send',
  'ai.input.hint': 'Enter to send · Shift+Enter for newline',
  'ai.error': '[error]',
  'ai.close': 'Close chat',

  // Selection popover
  'popover.translate': 'Translate',
  'popover.explain': 'Explain',
  'popover.verify': 'Verify',
  'popover.deep': 'Deep dive',
  'popover.generating': 'generating…',
  'popover.close': 'Close',

  // Summary panel
  'summary.title': 'Chapter summary',
  'summary.generate': 'Generate summary',
  'summary.generating': 'Generating…',
  'summary.regenerate': 'Regenerate',
  'summary.corePoints': 'Core claims',
  'summary.keyConcepts': 'Key concepts',
  'summary.argumentFlow': 'Argument flow',
  'summary.openQuestions': 'Open questions',

  // Timeline
  'timeline.title': 'Timeline',
  'timeline.search': 'Search original / answer / question…',
  'timeline.allChapters': 'All chapters',
  'timeline.empty.unfiltered': 'Start by highlighting text — AI will help.',
  'timeline.empty.filtered': 'No matching entries',
  'timeline.type.translate': 'Translate',
  'timeline.type.explain': 'Explain',
  'timeline.type.verify': 'Verify',
  'timeline.type.summarize': 'Summary',
  'timeline.type.chat': 'Chat',
  'timeline.question': 'Q:',

  // Export dialog
  'export.title': 'Export thinking doc',
  'export.format': 'Format',
  'export.format.markdown': 'Markdown',
  'export.format.html': 'HTML',
  'export.range': 'Range',
  'export.allChapters': 'All chapters',
  'export.cancel': 'Cancel',
  'export.confirm': 'Export',
  'export.generating': 'Generating…',
  'export.error': 'Export failed',

  // Settings
  'settings.title': 'Settings',
  'settings.section.models': 'Model services',
  'settings.section.routing': 'Task routing',
  'settings.section.budget': 'Budget',
  'settings.section.theme': 'Theme',
  'settings.section.font': 'Reading',
  'settings.section.language': 'Language',
  'settings.section.storage': 'Storage',
  'settings.section.selection': 'Selection bubble',
  'settings.section.prompts': 'Prompts',

  'settings.selection.title': 'Selection bubble',
  'settings.selection.description': 'Customize the selection bubble and AI result panel. Leave color fields empty to follow the active theme.',
  'settings.selection.bubbleBg': 'Bubble background',
  'settings.selection.bubbleText': 'Bubble text color',
  'settings.selection.bubbleAccent': 'Button accent color',
  'settings.selection.resultWidth': 'AI result panel width',
  'settings.selection.resultWidth.compact': 'Compact (280px)',
  'settings.selection.resultWidth.normal': 'Normal (400px)',
  'settings.selection.resultWidth.wide': 'Wide (560px)',
  'settings.selection.colorPlaceholder': 'Empty = follow theme',
  'settings.selection.reset': 'Reset to defaults',
  'settings.selection.saved': '✓ Saved',

  'settings.language.title': 'Language',
  'settings.language.description':
    'UI language. Defaults to your browser locale; an explicit choice is remembered.',
  'settings.language.auto': 'Follow browser',

  'settings.theme.title': 'Theme',
  'settings.theme.description':
    'Each pack has light + dark variants you can switch independently.',
  'settings.theme.packs': 'Theme packs',
  'settings.theme.mode': 'Mode',
  'settings.theme.mode.light': 'Light',
  'settings.theme.mode.dark': 'Dark',
  'settings.theme.mode.auto': 'Follow system',

  'settings.budget.title': 'Budget',
  'settings.budget.description':
    'Monthly AI spend budget (CNY). Alerts at 80% / 100%; never hard-stops.',
  'settings.budget.unit': '/ mo',
  'settings.budget.save': 'Save',
  'settings.budget.saved': '✓ Saved',
  'settings.budget.hint':
    'Reference: a typical 300k-character finance book costs ~¥180–300 depending on model and usage.',

  // Generic
  'common.loading': 'Loading…',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.confirm': 'OK',
};

const DICTS: Record<Locale, Dict> = { zh, en };

/** Translation key — a literal string from the dict, so it's autocompleted. */
export type TKey = keyof Dict;

/**
 * Look up `key` in `locale`'s dict. If a parameter map is supplied, all
 * `{name}` placeholders are substituted.
 *
 * Missing keys (shouldn't happen because `Dict` enforces it at compile
 * time, but possible for dynamic keys) fall back to the key itself.
 */
export function translate(
  locale: Locale,
  key: TKey,
  params?: Record<string, string | number>,
): string {
  const resolvedLocale = localeFromLanguageTag(locale) ?? 'zh';
  const dict = DICTS[resolvedLocale];
  const tmpl = dict[key] ?? (key as string);
  if (!params) return tmpl;
  return tmpl.replace(/\{(\w+)\}/g, (_, name) => {
    const v = params[name];
    return v === undefined ? `{${name}}` : String(v);
  });
}

/**
 * Detect the user's preferred locale from `navigator.language`.
 *
 * Strategy:
 *   - "zh*" → zh
 *   - anything else → en
 *
 * Safe to call on the server (returns 'zh' there since `navigator` is
 * undefined and our app's primary user base is CJK).
 */
export function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return 'zh';
  const languages = navigator.languages?.length
    ? navigator.languages
    : [navigator.language || 'zh'];
  for (const lang of languages) {
    const locale = localeFromLanguageTag(lang);
    if (locale) return locale;
  }
  return 'en';
}

function localeFromLanguageTag(tag: unknown): Locale | null {
  if (typeof tag !== 'string') return null;
  const normalized = tag.trim().toLowerCase().replace('_', '-');
  if (!normalized) return null;
  if (normalized.startsWith('zh')) return 'zh';
  if (normalized.startsWith('en')) return 'en';
  return null;
}

export type DrawingTool = 'brush' | 'eraser' | 'select' | 'text' | 'parts' | 'hand' | 'ai';

export interface ToolEntry { id: DrawingTool; label: string; key: string; hint: string }

export const drawingTools: ToolEntry[] = [
  { id: 'brush', label: '描く', key: 'B', hint: 'マウス・ペン・指で、ページに直接描けます。' },
  { id: 'eraser', label: '消しゴム', key: 'E', hint: '描いた線をなぞって消します。イラストの修正は「選択」→「イラストを編集」。' },
  { id: 'select', label: '選択', key: 'V', hint: 'イラストや文字をクリックして、位置や大きさを調整。' },
  { id: 'text', label: '文字', key: 'T', hint: '言葉を入力して、ページに追加します。' },
  { id: 'parts', label: '素材', key: 'I', hint: '素材をクリックして、ページに追加します。' },
  { id: 'hand', label: '移動', key: 'H', hint: 'ドラッグでキャンバスを移動。Spaceキーでも移動できます。' },
];

/** Shown only where an AI layer exists: the dev server's Claude CLI bridge today. */
export const aiTool: ToolEntry = { id: 'ai', label: 'AI', key: 'A', hint: '直したいところをページの上で囲んで、チャットで頼みます。' };

export const colorNames = ['赤', 'オレンジ', '黄', '緑', '青', '紫', '黒', 'ピンク', 'ピーチ', 'クリームイエロー', 'ミント', '水色', 'ラベンダー', 'アイボリー'];

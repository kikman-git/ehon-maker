export type DrawingTool = 'brush' | 'eraser' | 'select' | 'text' | 'parts' | 'hand';

export const drawingTools: { id: DrawingTool; label: string; key: string; hint: string }[] = [
  { id: 'brush', label: '描く', key: 'B', hint: 'マウス・ペン・指で、ページに直接描けます。' },
  { id: 'eraser', label: '消しゴム', key: 'E', hint: '消したい線をなぞります。元に戻すこともできます。' },
  { id: 'select', label: '選択', key: 'V', hint: 'イラストや文字をクリックして、位置や大きさを調整。' },
  { id: 'text', label: '文字', key: 'T', hint: '言葉を入力して、ページに追加します。' },
  { id: 'parts', label: '素材', key: 'I', hint: '素材をクリックして、ページに追加します。' },
  { id: 'hand', label: '移動', key: 'H', hint: 'ドラッグでキャンバスを移動。Spaceキーでも移動できます。' },
];

export const colorNames = ['赤', 'オレンジ', '黄', '緑', '青', '紫', '黒', 'ピンク', 'ピーチ', 'クリームイエロー', 'ミント', '水色', 'ラベンダー', 'アイボリー'];

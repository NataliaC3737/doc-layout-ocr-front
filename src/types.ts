export interface ResourceFile {
  name: string;
  type: string;
  size: number;
  base64?: string;
  url?: string;
}

export interface Block {
  id: string;
  type: 'h1' | 'h2' | 'h3' | 'paragraph' | 'bulleted-list' | 'numbered-list' | 'todo' | 'quote' | 'code' | 'image' | 'table';
  content: string;
  properties?: {
    checked?: boolean;
    language?: string;
    imageUrl?: string;
    rows?: string[][]; // For tables: 2D array of string cells
    textColor?: string;
    bgColor?: string;
  };
}

export interface Draft {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  blocks: Block[];
  resources: ResourceFile[];
  modelUsed?: string;
}

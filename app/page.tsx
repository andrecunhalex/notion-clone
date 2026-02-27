'use client';

import { NotionEditor } from './editor';

export default function Home() {
  return (
    <NotionEditor 
      title="MiniNotion"
      defaultViewMode="paginated"
      onChange={(blocks) => {
        // Aqui você pode salvar os blocos em um banco de dados,
        // localStorage, ou qualquer outra persistência
        console.log('Blocos atualizados:', blocks.length);
      }}
    />
  );
}
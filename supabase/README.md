# Supabase Setup

Execute os arquivos SQL **em ordem** no Supabase Dashboard > SQL Editor:

1. `001_documents.sql` — Tabela para persistir documentos (Yjs state)
2. `002_storage_images.sql` — Bucket de Storage para imagens do editor

## Depois de executar

1. **Ativar Realtime na tabela `documents`**:
   - Dashboard > Database > Tables > documents > "Realtime" toggle ON
   - Ou: `alter publication supabase_realtime add table documents;`

2. **Verificar o bucket de Storage**:
   - Dashboard > Storage > Deve aparecer "document-images"

3. **Configurar as env vars no projeto**:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

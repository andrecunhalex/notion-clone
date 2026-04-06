// ---------------------------------------------------------------------------
// Design Block Template Registry
//
// Each template is an HTML/Tailwind string with special data attributes:
//   data-editable="key"   → makes the element contentEditable (text zone)
//   data-swappable="key"  → makes the element clickable to swap image/icon
//
// To add a new design: push a new object to DESIGN_TEMPLATES.
// To import from Figma: export HTML, add data-editable/data-swappable
// attributes to interactive elements, and register here.
// ---------------------------------------------------------------------------

export interface DesignBlockTemplate {
  id: string;
  name: string;
  html: string;
  defaults: Record<string, string>;
  /** If set, the block receives auto-computed numbering based on document position */
  autonumber?: 'heading' | 'subheading';
}

export const DESIGN_TEMPLATES: DesignBlockTemplate[] = [
  {
    id: 'purple-card',
    name: 'Card com Ícone',
    defaults: {
      icon: 'https://api.iconify.design/mdi:account-outline.svg?width=48&height=48&color=%236b21a8',
      body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.',
    },
    html: `
      <div class="bg-purple-200 rounded-2xl p-6 text-center flex flex-col items-center gap-3 min-h-[120px]">
        <img
          data-swappable="icon"
          src=""
          alt="icon"
          class="w-12 h-12 object-contain"
        />
        <p
          data-editable="body"
          class="text-sm text-purple-900 leading-relaxed"
        ></p>
      </div>
    `,
  },
  {
    id: 'attention-callout',
    name: 'Callout Atenção',
    defaults: {
      icon: 'https://api.iconify.design/mdi:alert-outline.svg?width=32&height=32&color=%237c3aed',
      title: 'Atenção',
      body: 'Neste caso, não seremos responsáveis pelo atraso na entrega do(s) documento(s).',
    },
    html: `
      <div class="relative bg-white border border-purple-200 rounded-xl p-5 pl-5 border-l-4 border-l-purple-400 flex items-start gap-4 min-h-[80px]">
        <div class="flex-1 flex flex-col gap-1">
          <p
            data-editable="title"
            class="font-bold text-gray-900 text-base"
          ></p>
          <p
            data-editable="body"
            class="text-sm text-gray-600 leading-relaxed"
          ></p>
        </div>
        <img
          data-swappable="icon"
          src=""
          alt="icon"
          class="w-10 h-10 object-contain shrink-0 bg-purple-100 rounded-lg p-1.5"
        />
      </div>
    `,
  },
  {
    id: 'numbered-item',
    name: 'Item Numerado',
    defaults: {
      number: '2',
      body: 'Devem ser descontados os feriados, faltas, afastamentos médicos e suspensão do contrato.',
    },
    html: `
      <div class="flex items-center gap-0 min-h-[56px] overflow-hidden rounded-xl border border-gray-200">
        <div class="flex items-center gap-3 shrink-0">
          <div class="w-14 h-full min-h-[56px] bg-gradient-to-r from-purple-500 to-orange-400 rounded-l-xl"></div>
          <span
            data-editable="number"
            class="text-3xl font-bold text-gray-800 px-2 min-w-[40px] text-center"
          ></span>
        </div>
        <p
          data-editable="body"
          class="text-sm text-gray-700 leading-relaxed py-3 pr-4 flex-1"
        ></p>
      </div>
    `,
  },
  {
    id: 'numbered-heading',
    name: 'Título Numerado',
    autonumber: 'heading',
    defaults: {
      title: 'Título da seção',
    },
    html: `
      <div class="flex items-center gap-4 py-3 border-b-2 border-purple-400">
        <span
          data-autonumber
          class="text-4xl font-bold text-purple-600 shrink-0 min-w-[40px]"
        ></span>
        <p
          data-editable="title"
          class="text-xl font-semibold text-gray-900 flex-1"
        ></p>
      </div>
    `,
  },
  {
    id: 'numbered-subheading',
    name: 'Subtítulo Numerado',
    autonumber: 'subheading',
    defaults: {
      title: 'Subtítulo da seção',
    },
    html: `
      <div class="flex items-center gap-3 py-2 pl-4 border-l-3 border-purple-300 ml-2">
        <span
          data-autonumber
          class="text-lg font-bold text-purple-400 shrink-0 min-w-[36px]"
        ></span>
        <p
          data-editable="title"
          class="text-base font-medium text-gray-700 flex-1"
        ></p>
      </div>
    `,
  },

  {
    id: 'frame_626432-168-20',
    name: 'Frame 626432',
    defaults: {
      frame_626369: `https://vklmpyecqyqnbtifshmf.supabase.co/storage/v1/object/public/figma-images/OrNTggWUGkp0E2asf1hL2w/168-22.png`,
      obter_manter_em_vigor_e_arcar: `Obter, manter em vigor e arcar com os custos quaisquer licenças ou autorizações que sejam necessárias à execução do objeto contratual;`,
    },
    html: `<div style="display: flex; flex-direction: column; gap: 10px; background-color: #ffffff; border-top: 3px solid; border-color: #5026e9; padding: 20px 18px">
  <div style="display: flex; flex-direction: column; gap: 11px; align-self: stretch">
    <img style="width: 102px; height: 13px" data-swappable="frame_626369" src="" alt="Frame 626369" />
    <div style="width: 413px; font-size: 11px; font-family: 'Work Sans', sans-serif; line-height: 15px; color: #212221" data-editable="obter_manter_em_vigor_e_arcar"></div>
  </div>
</div>`,
  },
  {
    id: 'frame_5-70-29',
    name: 'Frame 5',
    defaults: {
      frame_104: `https://vklmpyecqyqnbtifshmf.supabase.co/storage/v1/object/public/figma-images/OrNTggWUGkp0E2asf1hL2w/70-30.png`,
      t_tulo_do_componente: `Título do componente`,
      descri_o_aqui: `Descrição aqui...`,
    },
    html: `<div style="display: flex; gap: 10px; overflow: hidden; width: 307px; background-color: #ffffff; padding: 10px">
  <img style="width: 108px; height: 108px" data-swappable="frame_104" src="" alt="Frame 104" />
  <div style="display: flex; flex-direction: column; gap: 10px; overflow: hidden; width: 169px; align-self: stretch; background-color: #bdfbc7; padding: 10px">
    <div style="align-self: stretch; font-size: 14px; font-weight: 600; font-family: 'Inter', sans-serif; line-height: 17px; color: #000000" data-editable="t_tulo_do_componente"></div>
    <div style="align-self: stretch; font-size: 12px; font-family: 'Inter', sans-serif; line-height: 15px; color: #ff0000" data-editable="descri_o_aqui"></div>
  </div>
</div>`,
  }
];

export function getTemplate(id: string): DesignBlockTemplate | undefined {
  return DESIGN_TEMPLATES.find(t => t.id === id);
}

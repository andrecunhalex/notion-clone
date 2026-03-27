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
];

export function getTemplate(id: string): DesignBlockTemplate | undefined {
  return DESIGN_TEMPLATES.find(t => t.id === id);
}

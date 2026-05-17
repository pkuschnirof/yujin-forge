/**
 * NAC-3 manifest for the todos plugin. The runtime reads this on
 * boot and exposes each verb to agents + the chat panel.
 *
 * Naming convention (Forge default): `{plugin}.{nac_id}.{verb}`.
 *
 * label_i18n covers the 10 NAC default locales. When `yf migrate`
 * generates a manifest from an existing project, Forge calls
 * Claude to fill in the 10 locales -- here we ship a seed set so
 * the starter compiles + runs.
 */
import type { Manifest } from '@yujin/nac';

export const TODOS_MANIFEST: Manifest = {
  plugin: 'todos',
  version: '1.0.0',
  elements: [
    {
      nac_id: 'todos.input',
      role:   'field',
      kind:   'text',
      label_i18n: {
        es: 'Nueva tarea',
        en: 'New task',
        pt: 'Nova tarefa',
        fr: 'Nouvelle tache',
        de: 'Neue Aufgabe',
        it: 'Nuovo compito',
        ja: '新しいタスク',
        zh: '新任务',
        hi: 'नया कार्य',
        ar: 'مهمة جديدة',
      },
    },
    {
      nac_id: 'todos.add_button',
      role:   'action',
      verb:   'add_todo',
      label_i18n: {
        es: 'Agregar', en: 'Add',     pt: 'Adicionar', fr: 'Ajouter',
        de: 'Hinzufügen', it: 'Aggiungere', ja: '追加', zh: '添加',
        hi: 'जोड़ें', ar: 'إضافة',
      },
    },
  ],
};

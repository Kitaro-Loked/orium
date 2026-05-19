/**
 * Orium - Setup Wizard Index
 */

export { runWizard, type WizardResult } from './wizard';
export {
  generateConfig,
  generateYaml,
  generateEnvFile,
  writeConfig,
  writeEnvFile,
  generateExampleYaml,
  type WizardAnswers,
} from './generators';
export {
  ADAPTER_PRESETS,
  CATEGORY_LABELS,
  getAdaptersByCategory,
  getPresetByName,
  type AdapterPreset,
} from './adapters-preset';
export {
  printWelcome,
  printSection,
  printSuccess,
  printWarning,
  printError,
  printInfo,
  ask,
  askSecret,
  select,
  multiselect,
  confirm,
  closePrompts,
  color,
  type PromptResult,
} from './prompts';

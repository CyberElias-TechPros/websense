// ============================================================================
// form-interaction.js — Form interaction simulation (F4.5).
// Features:
//   • Focus/type-partial/select/check without submitting
//   • Search box usage
//   • Newsletter signup (no submit)
//   • Contact form fill (no submit)
//   • Dropdown selection
// ============================================================================

import logger from '../utils/logger.js';

export class FormInteractionSimulator {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      typeChance: 0.4,
      selectChance: 0.3,
      checkChance: 0.2,
      partialType: true, // type only partial text, don't complete
      neverSubmit: true, // never actually submit forms
      ...config,
    };
    this.stats = { formsFound: 0, inputsFocused: 0, inputsTyped: 0, selectsChanged: 0, checksToggled: 0, formsFilled: 0 };
  }

  updateConfig(config) { Object.assign(this.config, config); }

  async simulate(page) {
    const details = { forms: [], inputs: [], actions: [] };

    try {
      // Detect forms and inputs
      const formData = await page.evaluate(() => {
        const forms = document.querySelectorAll('form');
        const inputs = document.querySelectorAll('input, select, textarea');
        return {
          formCount: forms.length,
          inputCount: inputs.length,
          searchInputs: document.querySelectorAll('input[type="search"], input[name*="search" i], input[type="text"][name*="q" i]').length,
          selects: document.querySelectorAll('select').length,
          checkboxes: document.querySelectorAll('input[type="checkbox"]').length,
          radios: document.querySelectorAll('input[type="radio"]').length,
        };
      });

      this.stats.formsFound += formData.formCount;

      // Step 1: Focus and type in text inputs
      if (formData.inputCount > 0 && Math.random() < this.config.typeChance) {
        const typeCount = Math.min(formData.inputCount, Math.floor(Math.random() * 3) + 1);
        for (let i = 0; i < typeCount; i++) {
          await page.evaluate(() => {
            const inputs = document.querySelectorAll('input[type="text"], input[type="email"], textarea');
            if (inputs.length > 0) {
              const input = inputs[Math.floor(Math.random() * inputs.length)];
              input.focus();
            }
          });
          this.stats.inputsFocused++;

          // Type partial text
          if (this.config.partialType) {
            const sampleTexts = ['hello', 'test', 'info', 'contact', 'about'];
            const text = sampleTexts[Math.floor(Math.random() * sampleTexts.length)];
            await page.type('input:focus, textarea:focus', text, { delay: 50 + Math.random() * 100 });
            this.stats.inputsTyped++;
            details.actions.push({ type: 'typing', text: text.substring(0, 10) });
          }
        }
        details.inputs = formData.inputCount;
        this.stats.formsFilled++;
      }

      // Step 2: Select dropdowns
      if (formData.selects > 0 && Math.random() < this.config.selectChance) {
        await page.evaluate(() => {
          const selects = document.querySelectorAll('select');
          for (let i = 0; i < Math.min(selects.length, 2); i++) {
            const opts = selects[i].options;
            if (opts.length > 1) selects[i].selectedIndex = Math.floor(Math.random() * opts.length);
          }
        });
        this.stats.selectsChanged += Math.min(formData.selects, 2);
        details.actions.push({ type: 'select_changed', count: Math.min(formData.selects, 2) });
      }

      // Step 3: Toggle checkboxes (no submit)
      if (formData.checkboxes > 0 && Math.random() < this.config.checkChance) {
        await page.evaluate(() => {
          const checkboxes = document.querySelectorAll('input[type="checkbox"]');
          for (let i = 0; i < Math.min(checkboxes.length, 3); i++) {
            if (!checkboxes[i].checked) checkboxes[i].click();
          }
        });
        this.stats.checksToggled += Math.min(formData.checkboxes, 3);
        details.actions.push({ type: 'checkboxes_toggled', count: Math.min(formData.checkboxes, 3) });
      }

      // Never submit
      if (this.config.neverSubmit) {
        details.actions.push({ type: 'no_submit', reason: 'Form fill simulation only' });
      }

      return { success: true, ...details, ...this.getStats() };
    } catch (err) {
      logger.warn(`Form interaction error: ${err.message}`);
      return { success: false, error: err.message, ...details };
    }
  }

  getStats() {
    return { enabled: this.config.enabled, ...this.stats };
  }
}

export default FormInteractionSimulator;

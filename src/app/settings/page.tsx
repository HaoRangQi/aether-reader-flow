/**
 * Settings page. Server Component shell; sections are client components.
 */
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { ModelServiceConfig } from '@/components/settings/ModelServiceConfig';
import { TaskRoutingConfig } from '@/components/settings/TaskRoutingConfig';
import { BudgetConfig } from '@/components/settings/BudgetConfig';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { FontPreferences } from '@/components/settings/FontPreferences';
import { LanguagePicker } from '@/components/settings/LanguagePicker';
import { StorageDebug } from '@/components/settings/StorageDebug';

export default function SettingsPage() {
  return (
    <SettingsLayout
      sections={{
        models: <ModelServiceConfig />,
        routing: <TaskRoutingConfig />,
        budget: <BudgetConfig />,
        theme: <ThemePicker />,
        font: <FontPreferences />,
        language: <LanguagePicker />,
        storage: <StorageDebug />,
      }}
    />
  );
}

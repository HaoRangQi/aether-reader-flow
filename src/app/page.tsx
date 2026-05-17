import { BookList } from '@/components/library/BookList';
import { BudgetIndicator } from '@/components/shared/BudgetIndicator';
import { SettingsNavLink } from '@/components/shared/SettingsNavLink';

export default function HomePage() {
  return (
    <main className="max-w-6xl mx-auto px-6 py-12">
      <div className="flex items-center justify-end gap-6 mb-6">
        <BudgetIndicator />
        <SettingsNavLink />
      </div>
      <BookList />
    </main>
  );
}

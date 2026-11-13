import { useTranslation } from 'react-i18next';

import { AdminPanel } from '@/components/AdminPanel';
import { Heading, Screen } from '@/components/ui';

/** All accounts with search, and the admin actions. The tab exists only for accounts the server says are admins. */
export default function AdminScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <Heading>{t('settings.adminTab')}</Heading>
      <AdminPanel />
    </Screen>
  );
}

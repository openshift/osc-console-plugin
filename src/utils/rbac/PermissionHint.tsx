import { Alert } from '@patternfly/react-core';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';

export const PermissionHint: FC<{ allowed: boolean; loading: boolean }> = ({
  allowed,
  loading,
}) => {
  const { t } = useTranslation('plugin__osc-openshift-console-plugin');
  if (loading || allowed) return null;
  return (
    <Alert
      variant="warning"
      isInline
      isPlain
      title={t(
        'You do not have permission to perform this action. Contact a cluster administrator.',
      )}
    />
  );
};

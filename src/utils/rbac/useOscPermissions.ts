import { useAccessReview } from '@openshift-console/dynamic-plugin-sdk';
import { OSC_NAMESPACE, PEER_PODS_CM } from '../../k8s/resources';

export const useOscPermissions = () => {
  const [canCreateKataConfig, loadingKc] = useAccessReview({
    group: 'kataconfiguration.openshift.io',
    resource: 'kataconfigs',
    verb: 'create',
  });

  const [canPatchKataConfig, loadingKcPatch] = useAccessReview({
    group: 'kataconfiguration.openshift.io',
    resource: 'kataconfigs',
    verb: 'patch',
  });

  return {
    canCreateKataConfig,
    canPatchKataConfig,
    isLoading: loadingKc || loadingKcPatch,
  };
};

export const useCanWritePeerPodsCm = (exists: boolean) => {
  const [allowed, loading] = useAccessReview({
    group: '',
    resource: 'configmaps',
    namespace: OSC_NAMESPACE,
    ...(exists ? { name: PEER_PODS_CM } : {}),
    verb: exists ? 'update' : 'create',
  });

  return { allowed, loading };
};

export const useCanCreateWorkload = (kind: 'Pod' | 'Deployment', namespace?: string) => {
  const [canCreate, loading] = useAccessReview({
    group: kind === 'Deployment' ? 'apps' : '',
    resource: kind === 'Deployment' ? 'deployments' : 'pods',
    namespace: namespace?.trim() || undefined,
    verb: 'create',
  });

  return { canCreate, loading };
};

export const useCanCreatePod = (namespace?: string) => {
  const [canCreate, loading] = useAccessReview({
    group: '',
    resource: 'pods',
    namespace: namespace?.trim() || undefined,
    verb: 'create',
  });
  return { canCreate, loading };
};

export const useCanDeleteWorkload = (kind: 'Pod' | 'Deployment', namespace?: string) => {
  const [canDelete, loading] = useAccessReview({
    group: kind === 'Deployment' ? 'apps' : '',
    resource: kind === 'Deployment' ? 'deployments' : 'pods',
    namespace: namespace?.trim() || undefined,
    verb: 'delete',
  });
  return { canDelete, loading };
};

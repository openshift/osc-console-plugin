import {
  DocumentTitle,
  k8sCreate,
  k8sGet,
  k8sPatch,
  ListPageHeader,
  useK8sWatchResource,
  type K8sResourceCommon,
} from '@openshift-console/dynamic-plugin-sdk';
import {
  ActionGroup,
  Alert,
  Button,
  Card,
  CardBody,
  CardTitle,
  Checkbox,
  CodeBlock,
  CodeBlockCode,
  ExpandableSection,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  Grid,
  GridItem,
  HelperText,
  HelperTextItem,
  PageSection,
  Radio,
  Switch,
  TextInput,
} from '@patternfly/react-core';
import type { FC } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  ConfigMapModel,
  FEATURE_GATES_CM,
  KATA_NODE_LABEL,
  KataConfigModel,
  OSC_NAMESPACE,
  NodeGVK,
  NodeModel,
} from '../k8s/resources';
import { useKataConfig } from '../k8s/hooks';
import {
  useControlPlaneTopology,
  useFeatureGatesCm,
  usePeerPodsCm,
} from '../k8s/setup';
import type { NodeKind } from '../k8s/types';
import {
  DAEMONSET_FALLBACK,
  isHostedTopology,
  modeWillReboot,
  resolveDeploymentMode,
} from '../utils/deploymentMode';
import { useOscPermissions } from '../utils/rbac/useOscPermissions';
import { PermissionHint } from '../utils/rbac/PermissionHint';
import { toYaml } from '../utils/yaml';
import './sandbox.css';

const WORKER_LABEL = 'node-role.kubernetes.io/worker';

type DeployMode = 'Auto' | 'DaemonSet' | 'MachineConfig';

// UI choice -> value written to osc-feature-gates .data.deploymentMode.
// 'Auto' uses DaemonSetFallback: the operator installs via DaemonSet only when the MachineConfig
// Operator is absent (hosted/HCP clusters) and via MachineConfig otherwise (standalone) — so it is
// correct on both topologies with zero user input.
const DEPLOYMENT_MODE_VALUE: Record<DeployMode, string> = {
  Auto: DAEMONSET_FALLBACK,
  DaemonSet: 'DaemonSet',
  MachineConfig: 'MachineConfig',
};

type ConfigMapKind = K8sResourceCommon & { data?: Record<string, string> };

const KataConfigWizard: FC = () => {
  const { t } = useTranslation('plugin__osc-openshift-console-plugin');
  const navigate = useNavigate();
  const { canCreateKataConfig, canPatchKataConfig, isLoading: rbacLoading } = useOscPermissions();

  const [name, setName] = useState('example-kataconfig');
  const [enablePeerPods, setEnablePeerPods] = useState(true);
  const [checkNodeEligibility, setCheckNodeEligibility] = useState(false);
  const [logLevel, setLogLevel] = useState('info');
  const [nodeMode, setNodeMode] = useState<'all' | 'specific'>('all');
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [deployMode, setDeployMode] = useState<DeployMode>('Auto');
  const [poolLabelKey, setPoolLabelKey] = useState('');
  const [poolLabelValue, setPoolLabelValue] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectorDirty, setSelectorDirty] = useState(false);
  const [deployModeDirty, setDeployModeDirty] = useState(false);
  const [explicitlyDeselectedNodes, setExplicitlyDeselectedNodes] =
    useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const [kataConfig, kcLoaded] = useKataConfig();
  const isEdit = kcLoaded && !!kataConfig;

  const [featureGatesCm, featureGatesSettled] = useFeatureGatesCm();

  useEffect(() => {
    if (!isEdit || !featureGatesSettled || deployModeDirty) {
      return;
    }

    const existingMode = featureGatesCm?.data?.deploymentMode;

    const mode: DeployMode =
      existingMode === 'DaemonSet'
        ? 'DaemonSet'
        : existingMode === 'MachineConfig'
          ? 'MachineConfig'
          : 'Auto';

    setDeployMode(mode);
  }, [
    isEdit,
    featureGatesSettled,
    featureGatesCm,
    deployModeDirty,
  ]);

  useEffect(() => {
    if (!isEdit || initialized) return;

    const spec = kataConfig?.spec ?? {};

    setName(kataConfig?.metadata?.name ?? 'example-kataconfig');
    setEnablePeerPods(spec.enablePeerPods ?? true);
    setCheckNodeEligibility(spec.checkNodeEligibility ?? false);
    setLogLevel(spec.logLevel ?? 'info');

    const labels = spec.kataConfigPoolSelector?.matchLabels ?? {};
    const entries = Object.entries(labels);

    if (labels[KATA_NODE_LABEL] === 'true') {
      setNodeMode('specific');
    } else if (entries.length === 1) {
      setPoolLabelKey(entries[0][0]);
      setPoolLabelValue(entries[0][1]);
    }

    setInitialized(true);
  }, [isEdit, initialized, kataConfig]);

  const [nodes, nodesLoaded] = useK8sWatchResource<NodeKind[]>({ groupVersionKind: NodeGVK, isList: true });
  const workerNodes = useMemo(
    () =>
      (nodes ?? []).filter((n) =>
        Object.keys(n.metadata?.labels ?? {}).includes(WORKER_LABEL),
      ),
    [nodes],
  );

  useEffect(() => {
    if (!isEdit || !initialized || selectorDirty) return;

    const labels =
      kataConfig?.spec?.kataConfigPoolSelector?.matchLabels;

    if (labels?.[KATA_NODE_LABEL] !== 'true') return;

    const nextSelected = workerNodes
      .filter(
        (node) =>
          node.metadata?.labels?.[KATA_NODE_LABEL] === 'true',
      )
      .map((node) => node.metadata?.name ?? '')
      .filter(Boolean);

    setSelectedNodes((previous) => {
      if (
        previous.length === nextSelected.length &&
        previous.every((name, index) => name === nextSelected[index])
      ) {
        return previous;
      }

      return nextSelected;
    });
  }, [isEdit, initialized, selectorDirty, kataConfig, workerNodes]);

  // Detect a hosted control plane (HyperShift/HCP): controlPlaneTopology === 'External' means there
  // is no in-cluster MachineConfig Operator, so kata must install via DaemonSet (no node reboots).
  const topology = useControlPlaneTopology();
  const isHosted = isHostedTopology(topology);

  // Absent only once the watch has settled — a named watch for a missing object 404s rather than
  // loading, so answering early would flash the warning at someone who does have a config map.
  const [peerPodsCm, peerPodsCmSettled] = usePeerPodsCm();
  const peerPodsCmMissing = peerPodsCmSettled && !peerPodsCm?.data?.CLOUD_PROVIDER;

  // A hand-picked node set is targeted by labeling those nodes and selecting on that label.
  const useSpecificNodes = nodeMode === 'specific' && selectedNodes.length > 0;

  const toggleNode = (node: string, checked: boolean) => {
    setSelectorDirty(true);

    setSelectedNodes((prev) =>
      checked
        ? Array.from(new Set([...prev, node]))
        : prev.filter((n) => n !== node),
    );

    setExplicitlyDeselectedNodes((prev) =>
      checked
        ? prev.filter((n) => n !== node)
        : Array.from(new Set([...prev, node])),
    );
  };

  const deploymentModeValue = DEPLOYMENT_MODE_VALUE[deployMode];
  // What the selection resolves to on this cluster (drives the reboot warning) — shared with the
  // setup checklist so the two screens agree on whether nodes reboot. undefined while detecting.
  const willReboot = modeWillReboot(resolveDeploymentMode(deploymentModeValue, isHosted));

  const spec: Record<string, unknown> = {
    ...(isEdit ? kataConfig?.spec ?? {} : {}),
    enablePeerPods,
    checkNodeEligibility,
    logLevel,
  };

  if (!isEdit || selectorDirty) {
    delete spec.kataConfigPoolSelector;

    if (useSpecificNodes) {
      spec.kataConfigPoolSelector = {
        matchLabels: { [KATA_NODE_LABEL]: 'true' },
      };
    } else if (poolLabelKey.trim()) {
      spec.kataConfigPoolSelector = {
        matchLabels: {
          [poolLabelKey.trim()]: poolLabelValue.trim(),
        },
      };
    }
  }

  const kataConfigManifest: K8sResourceCommon & Record<string, unknown> = {
    apiVersion: 'kataconfiguration.openshift.io/v1',
    kind: 'KataConfig',
    metadata: { name: name.trim() },
    spec,
  };

  const featureGateManifest: ConfigMapKind = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name: FEATURE_GATES_CM, namespace: OSC_NAMESPACE },
    data: { deploymentMode: deploymentModeValue },
  };

  // Create or update osc-feature-gates so the operator picks the deployment mode. It must exist
  // before the KataConfig, because the mode is read at the start of the KataConfig reconcile.
  const ensureFeatureGate = async () => {
    if (!isEdit || deployModeDirty) {
      const desired = { deploymentMode: deploymentModeValue };
      try {
        const existing = await k8sGet<ConfigMapKind>({
        model: ConfigMapModel,
        name: FEATURE_GATES_CM,
        ns: OSC_NAMESPACE,
        });
        // Merge so we preserve any other feature gates already set (confidential, layeredImageDeployment).
        // Only attempt patch if ConfigMap was found successfully.
        await k8sPatch({
          model: ConfigMapModel,
          resource: existing,
          data: [{ op: 'add', path: '/data', value: { ...(existing.data ?? {}), ...desired } }],
        });
      } catch (e) {
        // Only create if we got a 404 (not found). Other errors should propagate.
        const err = e as { response?: { status?: number } } | Error;
        const status = 'response' in err ? err.response?.status : undefined;
        if (status === 404) {
          await k8sCreate({ model: ConfigMapModel, data: featureGateManifest });
        } else {
          throw e;
        }
      }
    }
  };

  const save = async () => {
    if (
      !nodesLoaded &&
      (!isEdit || selectorDirty)
    ) {
      setError(t('Wait for node information to load.'));
      return;
    }

    setBusy(true);
    setError(undefined);
    try {
      await ensureFeatureGate();
      const previousSelectorUsesNodeLabels =
        kataConfig?.spec?.kataConfigPoolSelector
          ?.matchLabels?.[KATA_NODE_LABEL] === 'true';

      const shouldUpdateNodeLabels =
        (!isEdit || selectorDirty) && useSpecificNodes;

      if (shouldUpdateNodeLabels) {
        const desiredNodes = new Set(selectedNodes);

        const nodesToUnlabel = new Set(
          isEdit && previousSelectorUsesNodeLabels
            ? explicitlyDeselectedNodes
            : [],
        );

        const nodePatches = (nodes ?? []).flatMap((node) => {
          const nodeName = node.metadata?.name;

          if (!nodeName) return [];

          const currentlyLabeled =
            node.metadata?.labels?.[KATA_NODE_LABEL] === 'true';

          const shouldAdd =
            desiredNodes.has(nodeName) && !currentlyLabeled;

          const shouldRemove =
            nodesToUnlabel.has(nodeName) &&
            !desiredNodes.has(nodeName) &&
            currentlyLabeled;

          if (!shouldAdd && !shouldRemove) {
            return [];
          }

          return [
            k8sPatch({
              model: NodeModel,
              resource: node,
              data: shouldAdd
                ? [
                    {
                      op: 'add' as const,
                      path: `/metadata/labels/${KATA_NODE_LABEL}`,
                      value: 'true',
                    },
                  ]
                : [
                    {
                      op: 'remove' as const,
                      path: `/metadata/labels/${KATA_NODE_LABEL}`,
                    },
                  ],
            }),
          ];
        });

        await Promise.all(nodePatches);
      }
      if (isEdit) {
        await k8sPatch({
          model: KataConfigModel,
          resource: kataConfig!,
          data: [
            {
              op: 'add',
              path: '/spec/enablePeerPods',
              value: enablePeerPods,
            },
            {
              op: 'add',
              path: '/spec/checkNodeEligibility',
              value: checkNodeEligibility,
            },
            {
              op: 'add',
              path: '/spec/logLevel',
              value: logLevel,
            },
            ...(selectorDirty
              ? kataConfig?.spec?.kataConfigPoolSelector
                ? [
                    {
                      op: 'remove' as const,
                      path: '/spec/kataConfigPoolSelector',
                    },
                  ]
                : []
              : []),
            ...(selectorDirty && spec.kataConfigPoolSelector
              ? [
                  {
                    op: 'add' as const,
                    path: '/spec/kataConfigPoolSelector',
                    value: spec.kataConfigPoolSelector,
                  },
                ]
              : []),
          ],
        });
      } else {
        await k8sCreate({ model: KataConfigModel, data: kataConfigManifest });
      }
      void navigate('/sandboxes/setup');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const previewYaml = [
    ...(!isEdit || deployModeDirty ? [featureGateManifest] : []),
    kataConfigManifest,
  ]
    .map(toYaml)
    .join('\n---\n');

  return (
    <>
      <DocumentTitle>{isEdit ? t('Edit KataConfig') : t('Create KataConfig')}</DocumentTitle>
      <ListPageHeader title={isEdit ? t('Edit KataConfig') : t('Create KataConfig')} />
      <PageSection>
        {willReboot === false ? (
          <Alert
            variant="info"
            isInline
            title={t('Installing Kata will not reboot your nodes')}
            className="osc-openshift-console-plugin__mb"
          >
            {t(
              'DaemonSet mode installs the Kata runtime without draining or rebooting nodes — the right mode for hosted (HyperShift/HCP) clusters that have no MachineConfig Operator. Track progress on the Sandboxes overview.',
            )}
          </Alert>
        ) : willReboot === true ? (
          <Alert
            variant="warning"
            isInline
            title={t('Creating a KataConfig reboots your worker nodes')}
            className="osc-openshift-console-plugin__mb"
          >
            {t(
              'MachineConfig mode drains and reboots each eligible node — this can take from 10 to 60+ minutes. Track progress on the Sandboxes overview.',
            )}
          </Alert>
        ) : (
          <Alert
            variant="info"
            isInline
            title={t('Detecting cluster topology…')}
            className="osc-openshift-console-plugin__mb"
          >
            {t(
              'Determining whether this is a hosted or standalone cluster to pick the install method.',
            )}
          </Alert>
        )}
        <Grid hasGutter>
          <GridItem md={6}>
            <Card>
              <CardTitle>{t('KataConfig')}</CardTitle>
              <CardBody>
                <Form>
                  <FormGroup label={t('Name')} isRequired fieldId="kc-name">
                    <TextInput
                      id="kc-name"
                      value={name}
                      isDisabled={isEdit}
                      onChange={(_e, v) => {
                        setName(v);
                      }}
                    />
                  </FormGroup>
                  <FormGroup label={t('Enable peer pods')} fieldId="kc-peerpods">
                    <Switch
                      id="kc-peerpods"
                      isChecked={enablePeerPods}
                      onChange={(_e, c) => {
                        setEnablePeerPods(c);
                      }}
                      label={t('Run pods as cloud VMs (kata-remote) via the cloud-api-adaptor')}
                    />
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem>
                          {t(
                            'Required on clouds without nested virtualization (e.g. most GCP/AWS/Azure). It installs both runtime classes — kata-remote (peer pods) and kata (on-node) — so one cluster can run either, chosen per workload by its runtimeClassName. Turn it off to install only the on-node runtime, which needs no peer pods config map.',
                          )}
                        </HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                    {/* The ordering constraint only binds when peer pods are actually wanted, so it
                        belongs here rather than as a blanket block on creating a KataConfig at
                        all (issue #69). Warn, don't stop — the user may be about to create the
                        config map in another tab, or may know exactly what recreating costs. */}
                    {enablePeerPods && peerPodsCmMissing && (
                      <Alert
                        variant="warning"
                        isInline
                        title={t('No peer pods config map yet')}
                        className="osc-openshift-console-plugin__mt"
                      >
                        {t(
                          'The operator reads peer-pods-cm while installing this KataConfig, so create it first — otherwise the runtime comes up without peer pods wired and the KataConfig has to be recreated.',
                        )}{' '}
                        <Button
                          variant="link"
                          isInline
                          onClick={() => {
                            void navigate('/sandboxes/setup/peer-pods');
                          }}
                        >
                          {t('Configure peer pods')}
                        </Button>
                      </Alert>
                    )}
                  </FormGroup>

                  <FormGroup label={t('Deployment mode')} fieldId="kc-deploymode">
                    <Radio
                      id="kc-mode-auto"
                      name="kc-deploymode"
                      label={t('Auto-detect (recommended)')}
                      isChecked={deployMode === 'Auto'}
                      onChange={() => {
                        setDeployMode('Auto');
                        setDeployModeDirty(true);
                      }}
                    />
                    <Radio
                      id="kc-mode-daemonset"
                      name="kc-deploymode"
                      label={t('DaemonSet — install without rebooting nodes')}
                      isChecked={deployMode === 'DaemonSet'}
                      onChange={() => {
                        setDeployMode('DaemonSet');
                        setDeployModeDirty(true);
                      }}
                    />
                    <Radio
                      id="kc-mode-machineconfig"
                      name="kc-deploymode"
                      label={t('MachineConfig — reboots nodes (standalone clusters)')}
                      isChecked={deployMode === 'MachineConfig'}
                      onChange={() => {
                        setDeployMode('MachineConfig');
                        setDeployModeDirty(true);
                      }}
                    />
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem>
                          {t(
                            'Sets deploymentMode in the {{cm}} ConfigMap (created for you). Auto uses DaemonSetFallback: DaemonSet where there is no MachineConfig Operator (hosted clusters), MachineConfig otherwise.',
                            { cm: FEATURE_GATES_CM },
                          )}
                        </HelperTextItem>
                        {isHosted !== undefined && (
                          <HelperTextItem variant={isHosted ? 'success' : 'default'}>
                            {isHosted
                              ? t(
                                  'Detected: hosted control plane (no MachineConfig Operator). Auto will install via DaemonSet — no reboots.',
                                )
                              : t(
                                  'Detected: standalone cluster ({{topology}}). Auto will install via MachineConfig.',
                                  { topology },
                                )}
                          </HelperTextItem>
                        )}
                      </HelperText>
                    </FormHelperText>
                  </FormGroup>

                  <FormGroup label={t('Install on')} isInline fieldId="kc-node-mode">
                    <Radio
                      id="kc-nodes-all"
                      name="kc-node-mode"
                      label={t('All worker nodes')}
                      isChecked={nodeMode === 'all'}
                      onChange={() => {
                        setNodeMode('all');
                        setPoolLabelKey('');
                        setPoolLabelValue('');
                        setSelectorDirty(true);
                      }}
                    />
                    <Radio
                      id="kc-nodes-specific"
                      name="kc-node-mode"
                      label={t('Specific nodes')}
                      isChecked={nodeMode === 'specific'}
                      onChange={() => {
                        setNodeMode('specific');
                        setSelectorDirty(true);
                      }}
                    />
                  </FormGroup>
                  {nodeMode === 'specific' && (
                    <FormGroup fieldId="kc-node-list">
                      {workerNodes.length === 0 ? (
                        <HelperText>
                          <HelperTextItem>{t('No worker nodes found.')}</HelperTextItem>
                        </HelperText>
                      ) : (
                        <div className="osc-openshift-console-plugin__node-list">
                          {workerNodes.map((n) => {
                            const nodeName = n.metadata?.name ?? '';
                            return (
                              <Checkbox
                                key={nodeName}
                                id={`kc-node-${nodeName}`}
                                label={nodeName}
                                isChecked={selectedNodes.includes(nodeName)}
                                onChange={(_e, c) => {
                                  toggleNode(nodeName, c);
                                }}
                              />
                            );
                          })}
                        </div>
                      )}
                      <FormHelperText>
                        <HelperText>
                          <HelperTextItem>
                            {t(
                              'The runtime installs only on the nodes you pick — each is labeled {{label}}=true. Other workers are untouched.',
                              { label: KATA_NODE_LABEL },
                            )}
                          </HelperTextItem>
                        </HelperText>
                      </FormHelperText>
                    </FormGroup>
                  )}

                  <FormGroup label={t('Check node eligibility')} fieldId="kc-eligibility">
                    <Switch
                      id="kc-eligibility"
                      isChecked={checkNodeEligibility}
                      onChange={(_e, c) => {
                        setCheckNodeEligibility(c);
                      }}
                      label={t(
                        'Only install on nodes labeled feature.node.kubernetes.io/runtime.kata=true',
                      )}
                    />
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem>
                          {t(
                            'Requires Node Feature Discovery (NFD): it labels virt-capable nodes with that label, and the runtime installs only there. Leave this off if NFD is not installed — or pick Specific nodes above instead.',
                          )}
                        </HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  </FormGroup>
                  <FormGroup label={t('Log level')} fieldId="kc-loglevel">
                    <FormSelect
                      id="kc-loglevel"
                      value={logLevel}
                      onChange={(_e, v) => {
                        setLogLevel(v);
                      }}
                    >
                      <FormSelectOption value="info" label="info" />
                      <FormSelectOption value="debug" label="debug" />
                    </FormSelect>
                  </FormGroup>

                  <ExpandableSection
                    toggleText={t('Advanced options')}
                    isExpanded={advancedOpen}
                    onToggle={(_e, x) => {
                      setAdvancedOpen(x);
                    }}
                  >
                    <FormGroup label={t('Node selector label')} fieldId="kc-pool-key">
                      <TextInput
                        id="kc-pool-key"
                        value={poolLabelKey}
                        placeholder="node-role.kubernetes.io/worker"
                        onChange={(_e, v) => {
                          setSelectorDirty(true);
                          setPoolLabelKey(v);
                        }}
                      />
                      <FormHelperText>
                        <HelperText>
                          <HelperTextItem>
                            {t(
                              'Optional kataConfigPoolSelector. Leave empty to install on all worker nodes. Ignored when you pick Specific nodes above.',
                            )}
                          </HelperTextItem>
                        </HelperText>
                      </FormHelperText>
                    </FormGroup>
                    <FormGroup label={t('Node selector value')} fieldId="kc-pool-value">
                      <TextInput
                        id="kc-pool-value"
                        value={poolLabelValue}
                        onChange={(_e, v) => {
                          setSelectorDirty(true);
                          setPoolLabelValue(v);
                        }}
                      />
                    </FormGroup>
                  </ExpandableSection>

                  <PermissionHint allowed={isEdit ? canPatchKataConfig : canCreateKataConfig} loading={rbacLoading} />
                  {error && (
                    <Alert variant="danger" isInline title={isEdit ? t('Could not save KataConfig') : t('Could not create KataConfig')}>
                      {error}
                    </Alert>
                  )}

                  <ActionGroup>
                    <Button
                      variant="primary"
                      onClick={() => void save()}
                      isLoading={busy}
                      isDisabled={
                        busy ||
                        rbacLoading ||
                        (!nodesLoaded && (!isEdit || selectorDirty)) ||
                        (isEdit && !featureGatesSettled) ||
                        !(isEdit ? canPatchKataConfig : canCreateKataConfig) ||
                        name.trim() === '' ||
                        (nodeMode === 'specific' && selectedNodes.length === 0)
                      }
                    >
                      {isEdit ? t('Save') : t('Create')}
                    </Button>
                    <Button
                      variant="link"
                      onClick={() => {
                        void navigate('/sandboxes/setup');
                      }}
                    >
                      {t('Cancel')}
                    </Button>
                  </ActionGroup>
                </Form>
              </CardBody>
            </Card>
          </GridItem>
          <GridItem md={6}>
            <Card>
              <CardTitle>{t('Manifest preview')}</CardTitle>
              <CardBody>
                <CodeBlock>
                  <CodeBlockCode>{previewYaml}</CodeBlockCode>
                </CodeBlock>
              </CardBody>
            </Card>
          </GridItem>
        </Grid>
      </PageSection>
    </>
  );
};

export default KataConfigWizard;

export type StatusLabelMap = {
  open: string;
  in_progress: string;
  blocked: string;
  closed: string;
};

export interface BeadDetailStrings {
  dependencyTreeTitle: string;
  dependencyTreeUpstream: string;
  dependencyTreeDownstream: string;
  addUpstreamLabel: string;
  addDownstreamLabel: string;
  addUpstreamPrompt: string;
  addDownstreamPrompt: string;
  dependencyEmptyLabel: string;
  missingDependencyLabel: string;
  editLabel: string;
  editAssigneeLabel: string;
  deleteLabel: string;
  doneLabel: string;
  descriptionLabel: string;
  designLabel: string;
  acceptanceLabel: string;
  notesLabel: string;
  detailsLabel: string;
  assigneeLabel: string;
  assigneeFallback: string;
  externalRefLabel: string;
  createdLabel: string;
  updatedLabel: string;
  closedLabel: string;
  labelsLabel: string;
  noLabelsLabel: string;
  markInReviewLabel: string;
  removeInReviewLabel: string;
  addLabelLabel: string;
  addDependencyLabel: string;
  removeDependencyLabel: string;
  dependsOnLabel: string;
  blocksLabel: string;
  labelPrompt: string;
  statusLabels: StatusLabelMap;
  statusBadgeAriaLabel: string;
  statusDropdownLabel: string;
  statusOptionAriaLabel: string;
}

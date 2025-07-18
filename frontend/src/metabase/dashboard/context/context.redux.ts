import type { ConnectedProps } from "react-redux";
import { push } from "react-router-redux";

import { deletePermanently } from "metabase/archive/actions";
import {
  addCardToDashboard,
  addHeadingDashCardToDashboard,
  addLinkDashCardToDashboard,
  addMarkdownDashCardToDashboard,
  cancelFetchDashboardCardData,
  closeDashboard,
  closeSidebar,
  fetchDashboard,
  fetchDashboardCardData,
  hideAddParameterPopover,
  initialize,
  moveDashboardToCollection,
  onReplaceAllDashCardVisualizationSettings,
  onUpdateDashCardColumnSettings,
  onUpdateDashCardVisualizationSettings,
  removeParameter,
  reset,
  setArchivedDashboard,
  setDashboardAttributes,
  setEditingDashboard,
  setParameterDefaultValue,
  setParameterFilteringParameters,
  setParameterIsMultiSelect,
  setParameterName,
  setParameterQueryType,
  setParameterRequired,
  setParameterSourceConfig,
  setParameterSourceType,
  setParameterTemporalUnits,
  setParameterType,
  setParameterValue,
  setParameterValueToDefault,
  setSharing,
  setSidebar,
  showAddParameterPopover,
  toggleSidebar,
  updateDashboardAndCards,
} from "metabase/dashboard/actions";
import { connect } from "metabase/lib/redux";
import {
  canManageSubscriptions,
  getUserIsAdmin,
} from "metabase/selectors/user";
import type { State } from "metabase-types/store";

import {
  getClickBehaviorSidebarDashcard,
  getDashboardBeforeEditing,
  getDashboardComplete,
  getDraftParameterValues,
  getIsAddParameterPopoverOpen,
  getIsAdditionalInfoVisible,
  getIsDashCardsLoadingComplete,
  getIsDashCardsRunning,
  getIsDirty,
  getIsEditing,
  getIsEditingParameter,
  getIsHeaderVisible,
  getIsLoading,
  getIsLoadingWithoutCards,
  getIsNavigatingBackToDashboard,
  getIsSharing,
  getLoadingStartTime,
  getParameterValues,
  getParameters,
  getSelectedTabId,
  getSidebar,
  getSlowCards,
  getTabs,
} from "../selectors";

export const mapStateToProps = (state: State) => ({
  dashboard: getDashboardComplete(state),
  parameters: getParameters(state),
  tabs: getTabs(state),
  canManageSubscriptions: canManageSubscriptions(state),
  isAdmin: getUserIsAdmin(state),
  isEditing: getIsEditing(state),
  isSharing: getIsSharing(state),
  dashboardBeforeEditing: getDashboardBeforeEditing(state),
  isEditingParameter: getIsEditingParameter(state),
  isDirty: getIsDirty(state),
  slowCards: getSlowCards(state),
  parameterValues: getParameterValues(state),
  draftParameterValues: getDraftParameterValues(state),
  loadingStartTime: getLoadingStartTime(state),
  clickBehaviorSidebarDashcard: getClickBehaviorSidebarDashcard(state),
  isAddParameterPopoverOpen: getIsAddParameterPopoverOpen(state),
  sidebar: getSidebar(state),
  isRunning: getIsDashCardsRunning(state),
  isLoadingComplete: getIsDashCardsLoadingComplete(state),
  isHeaderVisible: getIsHeaderVisible(state),
  isAdditionalInfoVisible: getIsAdditionalInfoVisible(state),
  selectedTabId: getSelectedTabId(state),
  isNavigatingBackToDashboard: getIsNavigatingBackToDashboard(state),
  isLoading: getIsLoading(state),
  isLoadingWithoutCards: getIsLoadingWithoutCards(state),
});

export const mapDispatchToProps = {
  initialize,
  cancelFetchDashboardCardData,
  addCardToDashboard,
  addHeadingDashCardToDashboard,
  addMarkdownDashCardToDashboard,
  addLinkDashCardToDashboard,
  setEditingDashboard,
  setDashboardAttributes,
  setSharing,
  toggleSidebar,
  closeSidebar,
  setParameterName,
  setParameterType,
  setParameterValue,
  setParameterValueToDefault,
  setParameterDefaultValue,
  setParameterRequired,
  setParameterTemporalUnits,
  setParameterIsMultiSelect,
  setParameterQueryType,
  setParameterSourceType,
  setParameterSourceConfig,
  setParameterFilteringParameters,
  showAddParameterPopover,
  removeParameter,
  onReplaceAllDashCardVisualizationSettings,
  onUpdateDashCardVisualizationSettings,
  onUpdateDashCardColumnSettings,
  updateDashboardAndCards,
  setSidebar,
  hideAddParameterPopover,
  fetchDashboard,
  fetchDashboardCardData,
  onChangeLocation: push,
  reset,
  closeDashboard,
  setArchivedDashboard,
  deletePermanently,
  moveDashboardToCollection,
};

export const connector = connect(mapStateToProps, mapDispatchToProps);

export type ReduxProps = ConnectedProps<typeof connector>;

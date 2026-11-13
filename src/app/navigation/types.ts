export type RootTabParamList = {
  Dashboard: undefined;
  Alerts: undefined;
  Chat: undefined;
  Shelters: undefined;
  MeshStatus: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  SosModal: undefined;
  IncidentReport: undefined;
  IncidentDetail: { incidentId: string };
  ShelterDetail: { shelterId: string };
  Onboarding: undefined;
};

export interface DashboardSummary {
  companyId: string;
  agents: {
    active: number;
    running: number;
    paused: number;
    error: number;
    runningDeltaHour: number;
  };
  tasks: {
    open: number;
    inProgress: number;
    blocked: number;
    done: number;
    todayDone: number;
    todayDoneDelta: number;
  };
  costs: {
    monthSpendCents: number;
    monthBudgetCents: number;
    monthUtilizationPercent: number;
  };
  pendingApprovals: number;
  staleTasks: number;
}

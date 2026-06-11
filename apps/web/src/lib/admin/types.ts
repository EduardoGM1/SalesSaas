export interface MonthlyTrendPoint {
  month: string;
  label: string;
  sales: number;
  volume: number;
}

export interface SellerInfo {
  id: string;
  name: string;
  email: string | null;
  role: string;
}

export interface UserStat extends SellerInfo {
  created_at: string | null;
  is_active: boolean;
  is_super_admin: boolean;
  admin_permissions: string[];
  user_permissions: string[];
  prospects: number;
  sales: number;
  volume: number;
}

export interface UserAdminFilters {
  q?: string;
  role?: string;
  state?: "active" | "inactive";
}

export type UsersTableRow = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  is_active: boolean;
  is_super_admin: boolean;
  admin_permissions: string[];
  user_permissions: string[];
  created_at: string | null;
  prospects: number;
  sales: number;
  volume: number;
};

/** Props serializables para el editor de rol (cliente). */
export interface AdminRoleEditorProps {
  userId: string;
  userName: string;
  currentRole: string;
  isSelf: boolean;
}

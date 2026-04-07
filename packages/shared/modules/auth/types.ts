export interface License {
  id: string;
  key: string;
  stripe_customer: string;
  plan: 'standard';
  max_accounts: number;
  activated_at: number | null;
  expires_at: number | null;
  status: 'active' | 'revoked' | 'expired';
  created_at: number;
}

export interface AppUser {
  id: string;
  license_id: string;
  device_id: string | null;
  created_at: number;
  last_seen_at: number | null;
}

export interface LicenseVerifyRequest {
  key: string;
  device_id?: string;
}

export interface LicenseVerifyResponse {
  valid: boolean;
  license?: Pick<License, 'id' | 'plan' | 'max_accounts' | 'status' | 'expires_at'>;
  error?: string;
}

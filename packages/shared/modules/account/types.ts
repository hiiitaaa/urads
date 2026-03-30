export interface Account {
  id: string;
  license_id: string;
  threads_user_id: string;
  threads_handle: string;
  display_name: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface AccountUIState {
  id: string;
  account_id: string;
  ui_state: {
    active_page: string;
    draft?: {
      content: string;
      media_ids: string[];
    };
    filters?: Record<string, string>;
    scroll_positions?: Record<string, number>;
  };
  saved_at: number;
}

export type AccountSummary = Pick<Account, 'id' | 'threads_handle' | 'display_name'>;

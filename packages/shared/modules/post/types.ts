export type PostStatus = 'draft' | 'scheduled' | 'posting' | 'posted' | 'failed';
export type MediaType = 'image' | 'video' | 'carousel' | null;

export interface Post {
  id: string;
  account_id: string;
  content: string;
  media_type: MediaType;
  media_urls: string[] | null;
  status: PostStatus;
  threads_id: string | null;
  error: string | null;
  scheduled_at: number | null;
  posted_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface CreatePostRequest {
  content: string;
  media_type?: MediaType;
  media_urls?: string[];
  scheduled_at?: number;
}

export interface PostListResponse {
  posts: Post[];
  total: number;
}

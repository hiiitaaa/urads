/**
 * Threads Graph API 投稿処理
 */

const API_BASE = 'https://graph.threads.net/v1.0';

interface ThreadsPostResult {
  id: string;
}

/**
 * テキスト投稿
 */
export async function postText(
  userId: string,
  accessToken: string,
  text: string,
): Promise<ThreadsPostResult> {
  // 1. メディアコンテナ作成
  const containerRes = await fetch(`${API_BASE}/${userId}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      media_type: 'TEXT',
      text,
      access_token: accessToken,
    }),
  });

  if (!containerRes.ok) {
    const err = await containerRes.text();
    throw new Error(`コンテナ作成失敗: ${containerRes.status} ${err}`);
  }

  const container = await containerRes.json() as { id: string };

  // 2. 公開
  const publishRes = await fetch(`${API_BASE}/${userId}/threads_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      creation_id: container.id,
      access_token: accessToken,
    }),
  });

  if (!publishRes.ok) {
    const err = await publishRes.text();
    throw new Error(`公開失敗: ${publishRes.status} ${err}`);
  }

  return publishRes.json() as Promise<ThreadsPostResult>;
}

/**
 * リプライ投稿
 */
export async function postReply(
  userId: string,
  accessToken: string,
  text: string,
  replyToId: string,
): Promise<ThreadsPostResult> {
  // 1. リプライコンテナ作成
  const containerRes = await fetch(`${API_BASE}/${userId}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      media_type: 'TEXT',
      text,
      reply_to_id: replyToId,
      access_token: accessToken,
    }),
  });

  if (!containerRes.ok) {
    const err = await containerRes.text();
    throw new Error(`リプライコンテナ作成失敗: ${containerRes.status} ${err}`);
  }

  const container = await containerRes.json() as { id: string };

  // 2. 公開
  const publishRes = await fetch(`${API_BASE}/${userId}/threads_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      creation_id: container.id,
      access_token: accessToken,
    }),
  });

  if (!publishRes.ok) {
    const err = await publishRes.text();
    throw new Error(`リプライ公開失敗: ${publishRes.status} ${err}`);
  }

  return publishRes.json() as Promise<ThreadsPostResult>;
}

/**
 * コンテナステータスをポーリング（動画用）
 */
async function waitForContainer(
  containerId: string,
  accessToken: string,
  maxWaitMs = 180000,
): Promise<void> {
  const start = Date.now();
  const interval = 5000; // 5秒ごと

  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(`${API_BASE}/${containerId}?fields=status&access_token=${accessToken}`);
    if (res.ok) {
      const data = await res.json() as { status: string };
      if (data.status === 'FINISHED') return;
      if (data.status === 'ERROR') throw new Error('動画コンテナの処理に失敗しました');
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error(`動画処理がタイムアウトしました（${maxWaitMs / 1000}秒）`);
}

/**
 * 画像付き投稿
 */
export async function postImage(
  userId: string,
  accessToken: string,
  text: string,
  imageUrl: string,
): Promise<ThreadsPostResult> {
  // 1. メディアコンテナ作成
  const containerRes = await fetch(`${API_BASE}/${userId}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      media_type: 'IMAGE',
      image_url: imageUrl,
      text,
      access_token: accessToken,
    }),
  });

  if (!containerRes.ok) {
    const err = await containerRes.text();
    throw new Error(`画像コンテナ作成失敗: ${containerRes.status} ${err}`);
  }

  const container = await containerRes.json() as { id: string };

  // 2. 公開
  const publishRes = await fetch(`${API_BASE}/${userId}/threads_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      creation_id: container.id,
      access_token: accessToken,
    }),
  });

  if (!publishRes.ok) {
    const err = await publishRes.text();
    throw new Error(`画像公開失敗: ${publishRes.status} ${err}`);
  }

  return publishRes.json() as Promise<ThreadsPostResult>;
}

/**
 * 動画付き投稿（ポーリング付き、最大180秒待機）
 */
export async function postVideo(
  userId: string,
  accessToken: string,
  text: string,
  videoUrl: string,
): Promise<ThreadsPostResult> {
  const containerRes = await fetch(`${API_BASE}/${userId}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      media_type: 'VIDEO', video_url: videoUrl, text, access_token: accessToken,
    }),
  });
  if (!containerRes.ok) {
    const err = await containerRes.text();
    throw new Error(`動画コンテナ作成失敗: ${containerRes.status} ${err}`);
  }
  const container = await containerRes.json() as { id: string };

  await waitForContainer(container.id, accessToken);

  const publishRes = await fetch(`${API_BASE}/${userId}/threads_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: container.id, access_token: accessToken }),
  });
  if (!publishRes.ok) {
    const err = await publishRes.text();
    throw new Error(`動画公開失敗: ${publishRes.status} ${err}`);
  }
  return publishRes.json() as Promise<ThreadsPostResult>;
}

/**
 * カルーセル投稿（2-20枚の画像）
 */
export async function postCarousel(
  userId: string,
  accessToken: string,
  text: string,
  mediaUrls: string[],
): Promise<ThreadsPostResult> {
  if (mediaUrls.length < 2 || mediaUrls.length > 20) {
    throw new Error(`カルーセルは2〜20枚必要です（現在: ${mediaUrls.length}枚）`);
  }

  // 各画像の個別コンテナ作成
  const childIds: string[] = [];
  for (const url of mediaUrls) {
    const res = await fetch(`${API_BASE}/${userId}/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        media_type: 'IMAGE', image_url: url, is_carousel_item: 'true', access_token: accessToken,
      }),
    });
    if (!res.ok) throw new Error(`カルーセル画像コンテナ作成失敗: ${res.status}`);
    const c = await res.json() as { id: string };
    childIds.push(c.id);
  }

  // カルーセルコンテナ作成
  const carouselRes = await fetch(`${API_BASE}/${userId}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      media_type: 'CAROUSEL', children: childIds.join(','), text, access_token: accessToken,
    }),
  });
  if (!carouselRes.ok) throw new Error(`カルーセルコンテナ作成失敗: ${carouselRes.status}`);
  const carousel = await carouselRes.json() as { id: string };

  // 公開
  const publishRes = await fetch(`${API_BASE}/${userId}/threads_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: carousel.id, access_token: accessToken }),
  });
  if (!publishRes.ok) throw new Error(`カルーセル公開失敗: ${publishRes.status}`);
  return publishRes.json() as Promise<ThreadsPostResult>;
}

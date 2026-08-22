import type {
  V2CharacterId,
  V2CompanionGalleryResponse,
  V2CompanionMomentDto,
  V2CompanionRosterResponse,
  V2CreateCommentRequest,
  V2CreateCommentResponse,
  V2CreateMomentRequest,
  V2CreateMomentResponse,
  V2LikeMomentResponse,
  V2ListMomentsResponse,
  V2MomentId,
} from "@living-network/contracts/v2";

export interface V2CompanionClientOptions {
  readonly baseUrl: string;
}

export interface V2CompanionClient {
  listMoments(): Promise<readonly V2CompanionMomentDto[]>;
  createMoment(request: V2CreateMomentRequest): Promise<V2CompanionMomentDto>;
  toggleLikeMoment(momentId: V2MomentId): Promise<V2LikeMomentResponse>;
  addComment(momentId: V2MomentId, request: V2CreateCommentRequest): Promise<V2CreateCommentResponse>;
  getRoster(): Promise<V2CompanionRosterResponse>;
  getGallery(characterId?: V2CharacterId): Promise<V2CompanionGalleryResponse>;
  mediaUrl(mediaRef?: string): string;
}

export function createV2CompanionClient(options: V2CompanionClientOptions): V2CompanionClient {
  const base = options.baseUrl.replace(/\/+$/, "");

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${base}/api/v2${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });

    if (!res.ok) {
      const errorBody = (await res.json().catch(() => ({}))) as { error?: { message?: string }; message?: string };
      throw new Error(errorBody.error?.message || errorBody.message || `Request failed with status ${res.status}`);
    }

    return (await res.json()) as T;
  }

  return {
    async listMoments() {
      const data = await request<V2ListMomentsResponse>("/companion/moments");
      return data.moments;
    },
    async createMoment(payload) {
      const data = await request<V2CreateMomentResponse>("/companion/moments", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return data.moment;
    },
    async toggleLikeMoment(momentId) {
      return request<V2LikeMomentResponse>(`/companion/moments/${encodeURIComponent(momentId)}/like`, {
        method: "POST",
      });
    },
    async addComment(momentId, payload) {
      return request<V2CreateCommentResponse>(`/companion/moments/${encodeURIComponent(momentId)}/comments`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    async getRoster() {
      return request<V2CompanionRosterResponse>("/companion/roster");
    },
    async getGallery(characterId) {
      const query = characterId ? `?characterId=${encodeURIComponent(characterId)}` : "";
      return request<V2CompanionGalleryResponse>(`/companion/gallery${query}`);
    },
    mediaUrl(mediaRef) {
      if (!mediaRef) return "";
      if (mediaRef.startsWith("http://") || mediaRef.startsWith("https://") || mediaRef.startsWith("data:")) {
        return mediaRef;
      }
      const filename = mediaRef.replace(/^local:\/\/assets\//, "");
      return `${base}/api/v2/media/assets/${encodeURIComponent(filename)}`;
    },
  };
}

export interface MessengerRole {
  code: string;
  team_season_id: string | null;
}

export interface MessengerPermission {
  code: string;
  team_season_id: string | null;
}

export interface MessengerUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  last_seen_at: string | null;
  roles: MessengerRole[];
  permissions: MessengerPermission[];
}

export interface MessengerSession {
  token_type: "Bearer";
  access_token: string;
  access_token_expires_in: number;
  refresh_token: string;
  refresh_token_expires_at: string;
  user: MessengerUser;
}

export interface InvitationPreview {
  id: string;
  status: "active" | "revoked" | "expired" | "consumed";
  can_register: boolean;
  display_name: string | null;
  team_name: string;
  season_name: string;
  role_codes: string[];
  expires_at: string;
}

export interface MessengerRoom {
  id: string;
  team_id: string;
  team_name: string;
  kind: string;
  title: string;
  sort_order: number;
  can_write: boolean;
  can_send_media: boolean;
  can_react: boolean;
  last_read_sequence: string;
  last_delivered_sequence: string;
  unread_count: number;
  last_message: null | {
    id: string;
    sequence: string;
    kind: "text" | "image" | "video";
    text: string;
    created_at: string;
    media: null | { id: string; type: "image" | "video"; url: string };
    author: { id: string; display_name: string; avatar_url: string | null };
  };
}

export interface MessengerReaction {
  reaction: string;
  count: number;
  reacted_by_me: boolean;
}

export interface MessengerReply {
  id: string;
  kind: "text" | "image" | "video";
  text: string;
  deleted_at: string | null;
  author: {
    id: string;
    display_name: string;
  };
}

export interface MessengerMessage {
  id: string;
  sequence: string;
  room_id: string;
  client_message_id: string;
  kind: "text" | "image" | "video";
  text: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  author: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
  media: null | {
    id: string;
    type: "image" | "video";
    mime_type: string;
    size_bytes: number;
    url: string;
  };
  reply_to: MessengerReply | null;
  reactions: MessengerReaction[];
  delivery: {
    status: "sent" | "delivered" | "read";
    recipient_count: number;
    delivered_count: number;
    read_count: number;
  };
  pending?: boolean;
}

export interface MessengerOutboxItem {
  client_message_id: string;
  room_id: string;
  text: string;
  reply_to_message_id: string | null;
  created_at: string;
  attempts: number;
  last_error: string | null;
}

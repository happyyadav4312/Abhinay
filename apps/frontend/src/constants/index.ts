// Application constants

export const APP_NAME = 'Abhinay';
export const APP_DESCRIPTION = 'Film Production Networking and Casting Platform';

export const ROLES = [
  'ACTOR',
  'DIRECTOR',
  'PRODUCER',
  'CAMERA_OPERATOR',
  'EDITOR',
  'OTHER_CREW',
  'ADMIN',
] as const;

export type Role = (typeof ROLES)[number];

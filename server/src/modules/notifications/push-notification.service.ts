import * as admin from 'firebase-admin';
import { config } from '../../config/env';
import path from 'path';
import fs from 'fs';
import { supabase } from '../../config/supabase';
import logger from '../../utils/logger';

export interface PushNotificationPayload {
    title: string;
    body: string;
    data?: { [key: string]: string };
}

export class PushNotificationService {
    private isInitialized: boolean = false;

    constructor() {
        this.initialize();
    }

    private initialize() {
        if (this.isInitialized) return;

        try {
            const serviceAccountPath = config.firebase.serviceAccountPath;
            if (!serviceAccountPath) {
                logger.warn('Firebase service account path not configured. Push notifications will be disabled.');
                return;
            }

            const absolutePath = path.isAbsolute(serviceAccountPath)
                ? serviceAccountPath
                : path.join(process.cwd(), serviceAccountPath);

            if (!fs.existsSync(absolutePath)) {
                logger.error(`Firebase service account file not found at ${absolutePath}`);
                return;
            }

            const serviceAccount = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));

            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: config.firebase.projectId
            });

            this.isInitialized = true;
            logger.info('Firebase Admin SDK initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Firebase Admin SDK', { error });
        }
    }

    /**
     * Send notification to specific users based on their user IDs
     */
    async sendToUsers(userIds: string[], payload: PushNotificationPayload) {
        if (!this.isInitialized) {
            logger.warn('PushNotificationService not initialized. Skipping notification.');
            return;
        }

        try {
            // Get tokens for these users from Supabase
            const { data: tokenData, error } = await supabase
                .from('user_push_tokens')
                .select('token')
                .in('user_id', userIds);

            if (error) {
                logger.error('Error fetching user tokens', { error });
                return;
            }

            if (!tokenData || tokenData.length === 0) {
                logger.debug('No push tokens found for users', { userIds });
                return;
            }

            const tokens = tokenData.map(t => t.token);
            await this.sendToTokens(tokens, payload);
        } catch (error) {
            logger.error('Error in sendToUsers', { error });
        }
    }

    /**
     * Send notification to all users with a specific role, optionally filtered by factory
     */
    async sendToRole(role: string, payload: PushNotificationPayload, factoryId?: string) {
        if (!this.isInitialized) return;

        try {
            // Get users with the specific role from user_profiles
            let query = supabase
                .from('user_profiles')
                .select('id')
                .eq('role', role);

            if (factoryId) {
                query = query.eq('factory_id', factoryId);
            }

            const { data: profiles, error } = await query;

            if (error) {
                logger.error('Error fetching users by role', { error, role, factoryId });
                return;
            }

            logger.info('Found profiles for role', { count: profiles?.length, role, factoryId });

            if (!profiles || profiles.length === 0) return;

            const userIds = profiles.map(p => p.id);
            logger.info('Extracted userIds for role', { userIds, role });
            await this.sendToUsers(userIds, payload);
        } catch (error) {
            logger.error('Error in sendToRole', { error, role, factoryId });
        }
    }

    /**
     * Send notification to specific device tokens
     */
    async sendToTokens(tokens: string[], payload: PushNotificationPayload) {
        if (!this.isInitialized || tokens.length === 0) return;

        const message: admin.messaging.MulticastMessage = {
            tokens: tokens,
            notification: {
                title: payload.title,
                body: payload.body,
            },
            data: payload.data,
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'high_importance_channel'
                }
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                        badge: 1,
                    }
                }
            }
        };

        try {
            const response = await admin.messaging().sendEachForMulticast(message);
            logger.info('Successfully sent notifications', {
                successCount: response.successCount,
                failureCount: response.failureCount
            });

            // Handle invalid tokens if any
            if (response.failureCount > 0) {
                const invalidTokens: string[] = [];
                response.responses.forEach((resp, idx) => {
                    if (!resp.success && (
                        resp.error?.code === 'messaging/invalid-registration-token' ||
                        resp.error?.code === 'messaging/registration-token-not-registered'
                    )) {
                        invalidTokens.push(tokens[idx]);
                    }
                });

                if (invalidTokens.length > 0) {
                    await this.cleanupInvalidTokens(invalidTokens);
                }
            }
        } catch (error) {
            logger.error('Error sending multicast message', { error });
        }
    }

    /**
     * Register or update a push token for a user
     */
    async registerToken(userId: string, token: string, platform: 'android' | 'ios') {
        if (!this.isInitialized) return;

        try {
            const { error } = await supabase
                .from('user_push_tokens')
                .upsert({
                    user_id: userId,
                    token: token,
                    platform: platform,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id,token' });

            if (error) {
                logger.error('Error registering push token', { error, userId });
                throw error;
            }
        } catch (error) {
            logger.error('Error in registerToken', { error, userId });
            throw error;
        }
    }

    private async cleanupInvalidTokens(tokens: string[]) {
        try {
            await supabase
                .from('user_push_tokens')
                .delete()
                .in('token', tokens);
            logger.info('Cleaned up invalid push tokens', { count: tokens.length });
        } catch (error) {
            logger.error('Error cleaning up tokens', { error });
        }
    }
}

export const pushNotificationService = new PushNotificationService();

import React, { useCallback, useMemo } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { normalize } from '@/utils/normalize';
import { navigationBarBottomPadding } from '@/utils/status-bar-inset';
import HomeScreen from '@/screens/home';
import ChannelHome from '@/screens/channels';
import MoreScreen from '@/screens/more';
import { useDataContext } from '@/store/useDataContext';
import { GetRequest } from '@/utils/requests';
import { useFocusEffect } from '@react-navigation/native';
import { ACTIONS } from '@/store/types';
import { BuzzTabStack } from '@/navigation/stacks/buzz/buzz-tab-stack';
import MentionsScreen from '@/screens/mentions';
import { clearAllData } from '@/utils/helper';
import { parseOrganisationThreadsResponse } from '@/services/mentions/parse-organisation-threads';
import { syncRolesAndPermissionsFromApi } from '@/lib/role-permissions';
import { AppText } from '@/components/ui/text';
import { formatTabBadgeCount } from '@/utils';
import { Channel } from '@/types/channel';
import { Chat } from '@/types/chats';
import { useTheme } from '@/theme/ThemeProvider';
import Ionicons from 'react-native-vector-icons/Ionicons';

const Tab = createBottomTabNavigator();

const getChannelUnreadCount = (channel: Channel): number => {
  if (channel.thread_count > 0) {
    return channel.thread_count;
  }
  if (channel.mention_count > 0) {
    return channel.mention_count;
  }
  return 0;
};

const getDmUnreadCount = (chat: Chat): number => {
  return chat.thread_count > 0 ? chat.thread_count : 0;
};

// Accept a prop to notify when Chats is focused
const TabNavigator = ({
  onChatsFocus,
}: {
  onChatsFocus?: (isFocused: boolean) => void;
}) => {
  const { colors } = useTheme();
  const { state, dispatch } = useDataContext();
  const {
    orgId,
    userChannels,
    channelCallback,
    dms,
    callback,
    unseenThreadCount,
  } = state;
  const [currentTab, setCurrentTab] = React.useState('Chats');
  const insets = useSafeAreaInsets();
  const tabBarBottom = navigationBarBottomPadding(insets.bottom, normalize(12));
  const tabBarStyle = React.useMemo(
    () => ({
      borderTopWidth: 1,
      borderTopColor: colors.tabBarBorder,
      backgroundColor: colors.tabBar,
      height:
        Platform.OS === 'ios' ? normalize(85) : normalize(70) + tabBarBottom,
      paddingBottom: tabBarBottom,
      paddingTop: normalize(8),
    }),
    [colors, tabBarBottom],
  );

  const tabStyles = React.useMemo(
    () =>
      StyleSheet.create({
        tabBarLabel: {
          fontSize: normalize(12),
          fontWeight: '500',
        },
        tabIconWrap: {
          width: normalize(28),
          height: normalize(28),
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'visible',
        },
        tabIconInner: {
          width: normalize(24),
          height: normalize(24),
          overflow: 'visible',
        },
        tabBadge: {
          position: 'absolute',
          top: normalize(-4),
          right: normalize(-10),
          minWidth: normalize(18),
          height: normalize(18),
          borderRadius: normalize(9),
          backgroundColor: colors.primary,
          paddingHorizontal: normalize(4),
          paddingVertical: 0,
          alignItems: 'center',
          justifyContent: 'center',
        },
        tabBadgeWide: {
          minWidth: normalize(32),
          paddingHorizontal: normalize(5),
          right: normalize(-16),
        },
        tabBadgeText: {
          color: colors.white,
          fontSize: normalize(10),
          lineHeight: normalize(18),
          textAlign: 'center',
          includeFontPadding: false,
          textAlignVertical: 'center',
        },
        tabBadgeTextWide: {
          fontSize: normalize(9),
          letterSpacing: -0.25,
        },
      }),
    [colors],
  );

  const channelTabUnreadTotal = useMemo(() => {
    return (userChannels || []).reduce(
      (sum, channel) => sum + getChannelUnreadCount(channel),
      0,
    );
  }, [userChannels]);

  const showChannelTabBadge =
    channelTabUnreadTotal > 0 && currentTab !== 'Channels';

  const chatsTabUnreadTotal = useMemo(() => {
    return (dms || []).reduce((sum, chat) => sum + getDmUnreadCount(chat), 0);
  }, [dms]);

  const showChatsTabBadge = chatsTabUnreadTotal > 0 && currentTab !== 'Chats';

  const showThreadsTabBadge = unseenThreadCount > 0 && currentTab !== 'Threads';

  React.useEffect(() => {
    if (!orgId) return;

    let cancelled = false;

    const syncDms = async () => {
      const { data, error } = await GetRequest(
        `/organisations/${orgId}/dms?page=1&limit=50&search=`,
      );

      if (cancelled || error || !data?.data) return;

      dispatch({ type: ACTIONS.DMS, payload: data.data });
    };

    syncDms();

    return () => {
      cancelled = true;
    };
  }, [orgId, callback, dispatch]);

  React.useEffect(() => {
    if (!orgId) return;

    let cancelled = false;

    const syncUserChannels = async () => {
      const { data, error } = await GetRequest(
        `/organisations/${orgId}/user-channels?page=1&limit=50&search=`,
      );

      if (cancelled || error || !data?.data) return;

      dispatch({ type: ACTIONS.USER_CHANNELS, payload: data.data });
    };

    syncUserChannels();

    return () => {
      cancelled = true;
    };
  }, [orgId, channelCallback, dispatch]);

  React.useEffect(() => {
    if (!orgId) return;

    let cancelled = false;

    const syncThreadsUnreadCount = async () => {
      const { data, error } = await GetRequest(
        `/threads/organisations/${orgId}?page=1&limit=1`,
      );

      if (cancelled || error || !data?.data) return;

      const { unseenThreadCount: count } =
        parseOrganisationThreadsResponse(data);
      dispatch({ type: ACTIONS.UNSEEN_THREAD_COUNT, payload: count });
    };

    syncThreadsUnreadCount();

    return () => {
      cancelled = true;
    };
  }, [orgId, callback, channelCallback, dispatch]);

  useFocusEffect(
    useCallback(() => {
      const getUser = async () => {
        const { data, error } = await GetRequest(`/profile`);

        if (!error) {
          dispatch({ type: ACTIONS.USER, payload: data?.data });
        } else {
          await clearAllData();

          // Dispatch everything at once to prevent partial state UI renders
          dispatch({ type: ACTIONS.TOKEN, payload: null });
          dispatch({ type: ACTIONS.USER, payload: null });
          dispatch({ type: ACTIONS.ORG_DATA, payload: null });
          dispatch({ type: ACTIONS.DMS, payload: [] });
          dispatch({ type: ACTIONS.DMS_CHAT, payload: { data: [], page: 1 } });
        }
      };
      getUser();
    }, [dispatch, state?.callback]),
  );

  useFocusEffect(
    useCallback(() => {
      const getOrgData = async () => {
        const { data, error } = await GetRequest(
          `/organisations/${state?.orgId}`,
        );

        if (!error) {
          dispatch({ type: ACTIONS.ORG_DATA, payload: data?.data });
          syncRolesAndPermissionsFromApi();
        } else {
          await clearAllData();

          // Dispatch everything at once to prevent partial state UI renders
          dispatch({ type: ACTIONS.TOKEN, payload: null });
          dispatch({ type: ACTIONS.USER, payload: null });
          dispatch({ type: ACTIONS.ORG_DATA, payload: null });
          dispatch({ type: ACTIONS.DMS, payload: [] });
          dispatch({ type: ACTIONS.DMS_CHAT, payload: { data: [], page: 1 } });
        }
      };
      getOrgData();
    }, [dispatch, state?.callback]),
  );

  return (
    <Tab.Navigator
      screenOptions={({ route }: any) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: tabBarStyle,
        tabBarLabelStyle: tabStyles.tabBarLabel,
        tabBarIcon: ({ focused }: any) => {
          let iconSource;
          const iconStyle = {
            width: normalize(24),
            height: normalize(24),
            tintColor: focused ? colors.primary : colors.textSecondary,
          };

          if (route.name === 'Chats')
            iconSource = require('@/assets/tabs/chats.png');
          else if (route.name === 'Channels')
            iconSource = require('@/assets/tabs/channels.png');
          else if (route.name === 'Threads')
            iconSource = require('@/assets/tabs/mentions.png');
          else if (route.name === 'Buzz')
            iconSource = require('@/assets/tabs/buzz.png');
          else if (route.name === 'More') {
            return (
              <Ionicons
                name="ellipsis-horizontal-circle-outline"
                size={normalize(26)}
                color={focused ? colors.primary : colors.textSecondary}
              />
            );
          }

          const showTabBadge =
            (route.name === 'Chats' && showChatsTabBadge) ||
            (route.name === 'Channels' && showChannelTabBadge) ||
            (route.name === 'Threads' && showThreadsTabBadge);

          const tabBadgeCount =
            route.name === 'Chats'
              ? chatsTabUnreadTotal
              : route.name === 'Channels'
              ? channelTabUnreadTotal
              : route.name === 'Threads'
              ? unseenThreadCount
              : 0;

          const useBadgedTabIcon =
            route.name === 'Chats' ||
            route.name === 'Channels' ||
            route.name === 'Threads';

          if (useBadgedTabIcon) {
            const badgeLabel = formatTabBadgeCount(tabBadgeCount);
            const isWideBadge = badgeLabel.length > 2;

            return (
              <View style={tabStyles.tabIconWrap}>
                <View style={tabStyles.tabIconInner}>
                  <Image source={iconSource} style={iconStyle} />
                  {showTabBadge && (
                    <View
                      style={[
                        tabStyles.tabBadge,
                        isWideBadge && tabStyles.tabBadgeWide,
                      ]}
                    >
                      <AppText
                        variant="bold"
                        style={[
                          tabStyles.tabBadgeText,
                          isWideBadge && tabStyles.tabBadgeTextWide,
                        ]}
                      >
                        {badgeLabel}
                      </AppText>
                    </View>
                  )}
                </View>
              </View>
            );
          }

          return <Image source={iconSource} style={iconStyle} />;
        },
      })}
      // Listen to tab changes
      screenListeners={{
        state: (e: any) => {
          const tabIndex = e.data.state.index;
          const tabRoute = e.data.state.routeNames[tabIndex];
          setCurrentTab(tabRoute);
          if (onChatsFocus) onChatsFocus(tabRoute === 'Chats');
        },
      }}
    >
      <Tab.Screen
        name="Chats"
        component={HomeScreen}
        options={{ tabBarLabel: 'Chat' }}
      />
      <Tab.Screen name="Channels" component={ChannelHome} />
      <Tab.Screen name="Threads" component={MentionsScreen} />
      <Tab.Screen name="Buzz" component={BuzzTabStack} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
};

export default TabNavigator;

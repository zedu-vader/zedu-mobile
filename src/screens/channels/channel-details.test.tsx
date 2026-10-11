import React from 'react';
import { TouchableOpacity } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import {
  CommonActions,
  StackActions,
  StackRouter,
} from '@react-navigation/native';
import ChannelDetailsScreen from './channel-details';

jest.mock('@/theme/ThemeProvider', () => ({
  useTheme: () => ({ colors: {} }),
}));
jest.mock('@/theme/createScreenStyles', () => ({
  createGroupInfoStyles: () => ({}),
}));
jest.mock('@/store/useDataContext', () => ({
  useDataContext: () => ({
    state: {
      user: { user_id: 'self' },
      channelDetails: {
        name: 'Study group',
        participants: [{ user_id: 'member', username: 'Example member' }],
      },
    },
    dispatch: jest.fn(),
  }),
}));
jest.mock('@/lib/role-permissions', () => ({ userCan: () => false }));
jest.mock('@/components/layout/channels/add-description', () => ({
  AddDescription: () => null,
}));
jest.mock('@/components/layout/channels/exit-channel', () => ({
  ExitChannelSheet: () => null,
}));
jest.mock(
  '@/components/layout/channels/remove-members-confirmation-modal',
  () => () => null,
);
jest.mock('@/components/layout/container', () => {
  const { View } = require('react-native');
  return View;
});
jest.mock('@/services/buzz.service', () => ({}));
jest.mock('@/components/ui/toast', () => ({ ShowNotify: jest.fn() }));
jest.mock('@/utils/requests', () => ({ PostRequest: jest.fn() }));

test('opening a member profile keeps Members in the stack for Back', async () => {
  const router = StackRouter({});
  const options = {
    routeNames: ['ChannelChat', 'ChannelDetails', 'UserDetails'],
    routeParamList: {},
    routeGetIdList: {},
  };
  let stack = router.getInitialState(options);
  const apply = (action: Parameters<typeof router.getStateForAction>[1]) => {
    const next = router.getStateForAction(stack, action, options);
    if (!next || next.stale !== false)
      throw new Error('Unexpected unhandled navigation action');
    stack = next;
  };
  apply(StackActions.push('ChannelDetails', { channel_id: 'study-channel' }));
  const membersKey = stack.routes[stack.index].key;
  const navigation = {
    navigate: jest.fn((name: string, params: object) =>
      apply(CommonActions.navigate(name, params)),
    ),
    replace: jest.fn((name: string, params: object) =>
      apply(StackActions.replace(name, params)),
    ),
  };
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await act(() => {
    renderer = ReactTestRenderer.create(
      <ChannelDetailsScreen
        navigation={navigation}
        route={{ params: { channel_id: 'study-channel' } }}
      />,
    );
  });
  const member = renderer!.root
    .findAllByType(TouchableOpacity)
    .find(
      button =>
        button.findAll(node => node.props.children === 'Example member').length,
    );
  expect(member).toBeDefined();
  await act(() => member!.props.onPress());
  expect(stack.routes[stack.index].name).toBe('UserDetails');
  expect(stack.routes[stack.index].params).toEqual({
    participant: { user_id: 'member', username: 'Example member' },
    channel_id: 'study-channel',
  });
  apply(StackActions.pop());
  expect(stack.routes[stack.index].name).toBe('ChannelDetails');
  expect(stack.routes[stack.index].key).toBe(membersKey);
  expect(stack.routes[stack.index].params).toEqual({
    channel_id: 'study-channel',
  });
  apply(StackActions.pop());
  expect(stack.routes[stack.index].name).toBe('ChannelChat');
  await act(() => renderer?.unmount());
});

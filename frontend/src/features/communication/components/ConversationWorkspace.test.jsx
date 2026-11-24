import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConversationWorkspace from './ConversationWorkspace.jsx'

const mocks = vi.hoisted(() => ({
  getConversations: vi.fn(),
  getConversation: vi.fn(),
  getPendingConversations: vi.fn(),
  getPendingConversation: vi.fn(),
  classifyConversation: vi.fn(),
  sendConversationReply: vi.fn(),
  useAuth: vi.fn(),
}))

vi.mock('../../../context/AuthContext.jsx', () => ({
  useAuth: mocks.useAuth,
}))

vi.mock('../services/communication.service.js', () => ({
  getConversations: mocks.getConversations,
  getConversation: mocks.getConversation,
  getPendingConversations: mocks.getPendingConversations,
  getPendingConversation: mocks.getPendingConversation,
  classifyConversation: mocks.classifyConversation,
  sendConversationReply: mocks.sendConversationReply,
}))

const conversationList = {
  conversations: [
    {
      id: 41,
      contact_display_name: 'Ada Lovelace',
      contact_identifier: '08012345678',
      channel: 'sms',
      conversation_status: 'open',
      last_message_preview: 'I need more information.',
      message_count: 1,
    },
  ],
}

function makeDetail(channel = 'sms', status = 'open') {
  return {
    conversation: {
      id: 41,
      contact_display_name: 'Ada Lovelace',
      contact_identifier: channel === 'email'
        ? 'ada@example.com'
        : '08012345678',
      channel,
      conversation_status: status,
    },
    messages: [
      {
        id: 101,
        direction: 'inbound',
        body: 'I need more information.',
        delivery_status: 'received',
        received_at: '2026-11-20T10:00:00.000Z',
      },
    ],
  }
}

async function openConversation(channel = 'sms') {
  mocks.getConversations.mockResolvedValue(conversationList)
  mocks.getConversation.mockResolvedValue(makeDetail(channel))

  render(<ConversationWorkspace />)

  await userEvent.click(
    await screen.findByRole('button', { name: /Ada Lovelace/i }),
  )

  await screen.findByRole('heading', { name: 'Reply to customer' })
}

describe('ConversationWorkspace replies', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.useAuth.mockReturnValue({
      user: { id: 10, role: 'staff' },
    })

    mocks.getConversations.mockResolvedValue(conversationList)
    mocks.getConversation.mockResolvedValue(makeDetail())
    mocks.getPendingConversations.mockResolvedValue({ conversations: [] })
    mocks.sendConversationReply.mockResolvedValue({ message: 'Reply queued' })
  })

  it('sends an SMS reply with a trimmed message', async () => {
    const user = userEvent.setup()
    await openConversation('sms')

    await user.type(
      screen.getByLabelText('Message'),
      'Thank you for contacting us.',
    )

    await user.click(screen.getByRole('button', { name: 'Send reply' }))

    await waitFor(() => {
      expect(mocks.sendConversationReply).toHaveBeenCalledWith(41, {
        body: 'Thank you for contacting us.',
      })
    })

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Your reply has been added to the delivery queue.',
    )
  })

  it('requires an email subject and sends the email payload', async () => {
    const user = userEvent.setup()
    await openConversation('email')

    const sendButton = screen.getByRole('button', { name: 'Send reply' })
    expect(sendButton).toBeDisabled()

    await user.type(screen.getByLabelText('Email subject'), 'Your enquiry')
    await user.type(
      screen.getByLabelText('Message'),
      'We will be happy to assist.',
    )

    expect(sendButton).toBeEnabled()
    await user.click(sendButton)

    await waitFor(() => {
      expect(mocks.sendConversationReply).toHaveBeenCalledWith(41, {
        body: 'We will be happy to assist.',
        subject: 'Your enquiry',
      })
    })
  })

  it('sends WhatsApp template values in their original order', async () => {
    const user = userEvent.setup()
    await openConversation('whatsapp')

    await user.type(
      screen.getByPlaceholderText('Enter approved template name'),
      'order_update',
    )

    await user.type(
      screen.getByPlaceholderText('Enter one placeholder value per line, in template order. Leave empty if the template has no body placeholders.'),
      'Ada\nORD-204',
    )

    await user.click(screen.getByRole('button', { name: 'Send reply' }))

    await waitFor(() => {
      expect(mocks.sendConversationReply).toHaveBeenCalledWith(41, {
        body: '',
        templateKey: 'order_update',
        templateComponents: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Ada' },
              { type: 'text', text: 'ORD-204' },
            ],
          },
        ],
      })
    })
  })

  it('rejects blank WhatsApp placeholder values without sending', async () => {
    const user = userEvent.setup()
    await openConversation('whatsapp')

    await user.type(
      screen.getByPlaceholderText('Enter approved template name'),
      'order_update',
    )

    await user.type(
      screen.getByPlaceholderText('Enter one placeholder value per line, in template order. Leave empty if the template has no body placeholders.'),
      'Ada\n\nORD-204',
    )

    await user.click(screen.getByRole('button', { name: 'Send reply' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please provide a value for every template placeholder, in order.',
    )

    expect(mocks.sendConversationReply).not.toHaveBeenCalled()
  })

  it('shows a friendly permission error when replying is forbidden', async () => {
    const user = userEvent.setup()
    await openConversation('sms')

    mocks.sendConversationReply.mockRejectedValue({
      status: 403,
      message: 'Forbidden',
    })

    await user.type(
      screen.getByLabelText('Message'),
      'Thank you for your enquiry.',
    )

    await user.click(screen.getByRole('button', { name: 'Send reply' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have permission to reply to this conversation.',
    )
  })
})

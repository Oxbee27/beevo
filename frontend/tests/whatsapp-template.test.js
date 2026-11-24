import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildConversationReplyPayload,
  parseWhatsAppTemplateBodyValues,
} from '../src/features/communication/utils/whatsapp-template.js'

test('maps one placeholder into one text parameter', () => {
  const result = parseWhatsAppTemplateBodyValues('Ada')

  assert.equal(result.error, null)
  assert.deepEqual(result.templateComponents, [{
    type: 'body',
    parameters: [{ type: 'text', text: 'Ada' }],
  }])
})

test('preserves multiple placeholder values in their original order', () => {
  const result = parseWhatsAppTemplateBodyValues('Ada\nOrder 123\nTomorrow')

  assert.equal(result.error, null)
  assert.deepEqual(
    result.templateComponents[0].parameters,
    [
      { type: 'text', text: 'Ada' },
      { type: 'text', text: 'Order 123' },
      { type: 'text', text: 'Tomorrow' },
    ],
  )
})

test('trims whitespace around values', () => {
  const result = parseWhatsAppTemplateBodyValues('  Ada  \n  Order 123  ')

  assert.equal(result.error, null)
  assert.deepEqual(
    result.templateComponents[0].parameters,
    [
      { type: 'text', text: 'Ada' },
      { type: 'text', text: 'Order 123' },
    ],
  )
})

test('ignores trailing blank lines', () => {
  const result = parseWhatsAppTemplateBodyValues('Ada\nOrder 123\n\n  ')

  assert.equal(result.error, null)
  assert.deepEqual(
    result.templateComponents[0].parameters,
    [
      { type: 'text', text: 'Ada' },
      { type: 'text', text: 'Order 123' },
    ],
  )
})

test('rejects blank lines between placeholder values', () => {
  const result = parseWhatsAppTemplateBodyValues('Ada\n\nOrder 123')

  assert.equal(result.templateComponents.length, 0)
  assert.equal(
    result.error,
    'Please provide a value for every template placeholder, in order.',
  )
})

test('rejects whitespace-only placeholder values', () => {
  const result = parseWhatsAppTemplateBodyValues('   \nOrder 123')

  assert.notEqual(result.error, null)
  assert.deepEqual(result.templateComponents, [])
})

test('supports templates with no body placeholders', () => {
  const result = parseWhatsAppTemplateBodyValues('')

  assert.equal(result.error, null)
  assert.deepEqual(result.templateComponents, [])
})

test('supports Windows line endings', () => {
  const result = parseWhatsAppTemplateBodyValues('Ada\r\nOrder 123')

  assert.equal(result.error, null)
  assert.deepEqual(
    result.templateComponents[0].parameters,
    [
      { type: 'text', text: 'Ada' },
      { type: 'text', text: 'Order 123' },
    ],
  )
})


test('builds an SMS reply payload without WhatsApp fields', () => {
  const result = buildConversationReplyPayload({
    channel: 'sms',
    body: '  Your order is ready.  ',
    templateKey: 'should_not_be_included',
  })

  assert.equal(result.error, null)
  assert.deepEqual(result.payload, {
    body: 'Your order is ready.',
  })
})

test('builds an email reply payload with a trimmed subject and body', () => {
  const result = buildConversationReplyPayload({
    channel: 'email',
    body: '  Your order has shipped. ',
    subject: '  Order update  ',
  })

  assert.equal(result.error, null)
  assert.deepEqual(result.payload, {
    body: 'Your order has shipped.',
    subject: 'Order update',
  })
})

test('builds a WhatsApp reply payload with template parameters', () => {
  const result = buildConversationReplyPayload({
    channel: 'whatsapp',
    body: '  Ada  \n Order 123 ',
    templateKey: '  order_update ',
    subject: 'unused subject',
  })

  assert.equal(result.error, null)
  assert.deepEqual(result.payload, {
    body: '',
    templateKey: 'order_update',
    templateComponents: [{
      type: 'body',
      parameters: [
        { type: 'text', text: 'Ada' },
        { type: 'text', text: 'Order 123' },
      ],
    }],
  })
})

test('does not produce a WhatsApp payload when a placeholder is blank', () => {
  const result = buildConversationReplyPayload({
    channel: 'whatsapp',
    body: 'Ada\n\nOrder 123',
    templateKey: 'order_update',
  })

  assert.equal(result.payload, null)
  assert.equal(
    result.error,
    'Please provide a value for every template placeholder, in order.',
  )
})

test('normalizes channel names before preparing the payload', () => {
  const result = buildConversationReplyPayload({
    channel: 'EMAIL',
    body: 'Hello',
    subject: 'Welcome',
  })

  assert.equal(result.error, null)
  assert.deepEqual(result.payload, {
    body: 'Hello',
    subject: 'Welcome',
  })
})

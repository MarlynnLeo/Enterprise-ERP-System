jest.mock('../../src/config/db', () => ({ pool: {}, getConnection: jest.fn() }));

const Posting = require('../../src/services/InventoryPostingService');

function connectionFixture({ numberingError, missingRule = false, existing = null } = {}) {
  let document = existing;
  const connection = {
    query: jest.fn(async (sql, params) => {
      if (numberingError) throw numberingError;
      if (sql.includes('FROM coding_rules')) {
        return [missingRule ? [] : [{
          business_type: params[0], prefix: params[0].endsWith('reversal') ? 'RPST' : 'PST',
          date_format: '', separator: '-', sequence_length: 4,
          reset_cycle: 'none', initial_value: 1, step: 1,
        }]];
      }
      if (sql.includes('INSERT INTO coding_sequences')) return [{ affectedRows: 1, insertId: 1 }];
      throw new Error(`Unexpected numbering SQL: ${sql}`);
    }),
    execute: jest.fn(async (sql, params) => {
      if (sql.includes('ORDER BY posting_sequence')) return [existing ? [existing] : []];
      if (sql.includes('INSERT INTO inventory_posting_documents')) {
        document = { id: 42, posting_no: params[0], finance_status: 'pending' };
        return [{ insertId: document.id }];
      }
      if (sql.includes('FROM inventory_posting_documents WHERE id')) return [[document]];
      if (sql.includes('INSERT INTO inventory_posting_events')) return [{ insertId: 1 }];
      throw new Error(`Unexpected posting SQL: ${sql}`);
    }),
  };
  return connection;
}

const input = { sourceType: 'inbound', sourceId: 9, sourceNo: 'IN-9', transactionDate: '2026-10-13' };

test.each(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT', 'ECONNRESET'])(
  'propagates %s without writing a posting or event after numbering fails', async (code) => {
    const error = Object.assign(new Error(code), { code });
    const connection = connectionFixture({ numberingError: error });
    await expect(Posting._getOrCreateDocument(connection, input)).rejects.toBe(error);
    expect(connection.execute.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql))).toBe(false);
  }
);

test('a missing coding rule fails explicitly instead of silently issuing a random number', async () => {
  const connection = connectionFixture({ missingRule: true });
  await expect(Posting._getOrCreateDocument(connection, input)).rejects.toThrow('编码规则未配置');
  expect(connection.execute).toHaveBeenCalledTimes(1);
});

test.each([['movement', 'inventory_posting', 'PST-0001'], ['reversal', 'inventory_posting_reversal', 'RPST-0001']])(
  'uses the transaction connection and %s sequence for a new posting', async (postingKind, type, number) => {
    const connection = connectionFixture();
    const document = await Posting._getOrCreateDocument(connection, { ...input, postingKind });
    expect(document.posting_no).toBe(number);
    expect(connection.query.mock.calls[0][1]).toEqual([type]);
    expect(connection.query.mock.calls[1][1][0]).toBe(type);
    expect(connection.execute.mock.calls.filter(([sql]) => sql.includes('INSERT INTO'))).toHaveLength(2);
  }
);

test('an idempotent replay reuses the existing posting without consuming another number', async () => {
  const existing = { id: 42, posting_no: 'PST-0001', finance_status: 'pending' };
  const connection = connectionFixture({ existing });
  await expect(Posting._getOrCreateDocument(connection, input)).resolves.toBe(existing);
  expect(connection.query).not.toHaveBeenCalled();
  expect(connection.execute).toHaveBeenCalledTimes(1);
});

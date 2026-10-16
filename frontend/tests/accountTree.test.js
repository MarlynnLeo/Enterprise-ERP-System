import { describe, expect, it } from 'vitest'
import {
  buildAccountTree,
  filterAccountTree,
  getAccountBranchKeys
} from '../src/utils/accountTree.js'

const account = (id, accountCode, accountName, extra = {}) => ({
  id,
  accountCode,
  accountName,
  accountType: '资产',
  ...extra
})

const shape = (nodes) => nodes.map((node) => ({
  id: node.id,
  ...(node.children ? { children: shape(node.children) } : {})
}))

const flatten = (nodes) => nodes.flatMap((node) => [
  node,
  ...flatten(node.children || [])
])

const searchTree = () => buildAccountTree([
  account(4, '100202', 'Cash CNY'),
  account(3, '10020101', 'USD operating'),
  account(7, '200101', 'USD credit', { accountType: '负债' }),
  account(1, '1002', 'Treasury'),
  account(6, '2001', 'Borrowings', { accountType: '负债' }),
  account(2, '100201', 'Bank deposits')
])

describe('buildAccountTree', () => {
  it('groups unsorted legacy accounts by their longest strict code prefix', () => {
    const tree = buildAccountTree([
      account(4, '100202', '其他银行存款'),
      account(3, '10020101', '人民币账户'),
      account(5, '2001', '短期借款'),
      account(1, '1002', '银行存款'),
      account(2, '100201', '基本账户')
    ])

    expect(shape(tree)).toEqual([
      {
        id: 1,
        children: [
          { id: 2, children: [{ id: 3 }] },
          { id: 4 }
        ]
      },
      { id: 5 }
    ])
    for (const node of flatten(tree)) {
      expect(node.fullName).toBe(`${node.accountCode} - ${node.accountName}`)
    }
    expect(tree[0].children[0].children[0]).not.toHaveProperty('children')
    expect(tree[1]).not.toHaveProperty('children')
  })

  it('honors valid parent IDs across number/string types and infers missing parents', () => {
    const tree = buildAccountTree([
      account(3, '100201', '指定父级', { parentId: '20' }),
      account(4, '100202', '失效父级', { parentId: 999 }),
      account(5, '200101', '数字父级', { parentId: 20 }),
      account(10, '1002', '银行存款'),
      account('20', '2001', '短期借款')
    ])

    expect(shape(tree)).toEqual([
      { id: 10, children: [{ id: 4 }] },
      { id: '20', children: [{ id: 3 }, { id: 5 }] }
    ])
  })

  it('keeps orphans, self references and cyclic relationships reachable exactly once', () => {
    const accounts = [
      account(11, '100201', '自引用子级', { parentId: 11 }),
      account(32, '5001', '循环乙', { parentId: 31 }),
      account(33, '500101', '循环下级'),
      account(30, '3001', '孤立科目', { parentId: 999 }),
      account(10, '1002', '自引用大类', { parentId: 10 }),
      account(31, '4001', '循环甲', { parentId: 32 })
    ]
    const tree = buildAccountTree(accounts)
    const rows = flatten(tree)

    expect(rows.map((row) => row.id).sort((a, b) => a - b))
      .toEqual([10, 11, 30, 31, 32, 33])
    expect(tree.some((node) => node.id === 30)).toBe(true)
    expect(rows.find((node) => node.id === 10).children.map((node) => node.id))
      .toContain(11)
    expect(() => JSON.stringify(tree)).not.toThrow()
  })

  it('does not mutate the input rows or their original order', () => {
    const child = Object.freeze(account(2, '100201', '基本账户', { isActive: true }))
    const parent = Object.freeze(account(1, '1002', '银行存款'))
    const accounts = Object.freeze([child, parent])
    const before = JSON.stringify(accounts)
    const tree = buildAccountTree(accounts)

    expect(JSON.stringify(accounts)).toBe(before)
    expect(tree[0]).not.toBe(parent)
    expect(tree[0].children[0]).not.toBe(child)
    expect(tree[0].children[0].isActive).toBe(true)
  })

  it('keeps a child at the root when its longest matching prefix is ambiguous', () => {
    const tree = buildAccountTree([
      account(5, '10020101', '父编码重复的下级'),
      account(1, '1002', '银行存款'),
      account(2, '100201', '重复科目甲'),
      account(3, '100201', '重复科目乙'),
      account(4, '100201', '重复科目丙')
    ])

    expect(shape(tree)).toEqual([
      { id: 1, children: [{ id: 2 }, { id: 3 }, { id: 4 }] },
      { id: 5 }
    ])
  })

  it('returns an empty tree for an empty account list', () => {
    expect(buildAccountTree([])).toEqual([])
  })
})

describe('filterAccountTree', () => {
  it('keeps the complete ancestor path for a matching leaf and trims case-insensitive searches', () => {
    const tree = searchTree()
    const before = JSON.stringify(tree)
    const filtered = filterAccountTree(tree, {
      account_code: ' 10020101 ',
      account_name: ' uSd ',
      account_type: '资产'
    })

    expect(shape(filtered)).toEqual([
      { id: 1, children: [{ id: 2, children: [{ id: 3 }] }] }
    ])
    expect(JSON.stringify(tree)).toBe(before)
  })

  it('retains all descendants when a parent matches the search', () => {
    const filtered = filterAccountTree(searchTree(), { account_name: 'treasury' })

    expect(shape(filtered)).toEqual([
      {
        id: 1,
        children: [
          { id: 2, children: [{ id: 3 }] },
          { id: 4 }
        ]
      }
    ])
  })

  it('combines code, name and exact account type filters on the same account', () => {
    const tree = searchTree()

    expect(shape(filterAccountTree(tree, {
      account_code: '2001',
      account_name: 'usd',
      account_type: '负债'
    }))).toEqual([{ id: 6, children: [{ id: 7 }] }])
    expect(filterAccountTree(tree, {
      account_code: '1002',
      account_name: 'usd',
      account_type: '负债'
    })).toEqual([])
    expect(filterAccountTree(tree, { account_type: '资' })).toEqual([])
  })

  it('preserves all accounts when the filters are empty', () => {
    const tree = searchTree()

    expect(filterAccountTree(tree, {
      account_code: '  ',
      account_name: '',
      account_type: ''
    })).toEqual(tree)
    expect(filterAccountTree([], { account_name: '银行' })).toEqual([])
  })
})

describe('getAccountBranchKeys', () => {
  it('returns string IDs for every expandable branch, including nested branches', () => {
    expect(getAccountBranchKeys(searchTree())).toEqual(['1', '2', '6'])
    expect(getAccountBranchKeys([account(1, '1001', '库存现金')])).toEqual([])
    expect(getAccountBranchKeys([])).toEqual([])
  })
})

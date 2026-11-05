import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { findRereadPosition } from './speech-matcher'
import { tokenize } from './word-tokenizer'

const reference = (text: string) => tokenize(text).filter(t => t.type === 'TOKEN')
const script = reference(
	'Thanks for your time today and thanks to the team for the introduction. I spent seven years as a Solutions ' +
	'Engineer at Tableau with clients across Brazil. Then I moved to Canada with my family and finished a master ' +
	'degree in management last September. Now I am returning to presales because that is where my work had the ' +
	'most impact on customers and the teams I supported every single day of those years.'
)
const at = (word: string) => script.findIndex(t => t.value === word)

describe('reading a line again', () => {
	test('goes back: the words heard sit behind the place', () => {
		const end = findRereadPosition('I spent seven years as a', script, at('customers'))
		expect(script[end].value).toBe('a')
		expect(end).toBeLessThan(at('customers'))
	})

	test('goes back: one misheard word is forgiven, accents and case never count', () => {
		const end = findRereadPosition('i spent seventh years as a', script, at('customers'))
		expect(script[end].value).toBe('a')
		const pt = reference('Vim para o Canadá com a família e terminei o mestrado aqui em setembro depois de muito trabalho duro neste ano inteiro de estudo e dedicação')
		expect(findRereadPosition('vim para o canada com a', pt, 28)).toBe(5)
	})

	test('goes back: a recognizer that drops short words still lands on the line', () => {
		const pt = reference('Trabalhei sete anos como engenheiro de soluções na Tableau atendendo bancos e hospitais em todo o Brasil. Vim para o Canadá com a família e aprendi mais sobre paciência do que em qualquer treinamento de vendas. Terminei o mestrado aqui em setembro e agora penso em gestão de um jeito completamente diferente. Os clientes raramente compram o produto porque o que eles querem de verdade é um problema menor amanhã.')
		const here = pt.length - 1
		const end = findRereadPosition('vim para canadá com família e', pt, here)
		expect(pt[end].value).toBe('e')
		expect(pt.slice(end - 6, end + 1).map(t => t.value).join(' ')).toBe('Vim para o Canadá com a família e'.split(' ').slice(1).join(' '))
	})

	test('stays: fewer than six words prove nothing', () => {
		expect(findRereadPosition('I spent seven years', script, at('customers'))).toBe(-1)
	})

	test('stays: a phrase that occurs twice in range does not say which', () => {
		const twins = reference('the same exact phrase is here now and some other words fill the space between them all the same exact phrase is here now and more words follow on after it for quite a long while yes indeed they do')
		expect(findRereadPosition('the same exact phrase is here', twins, twins.length - 1)).toBe(-1)
	})

	test('stays: a reader moving forward is only a little behind', () => {
		const i = at('Tableau')
		expect(findRereadPosition('as a Solutions Engineer at Tableau', script, i + 2)).toBe(-1)
	})

	test('stays: words ahead are forward reading, not a re-read', () => {
		expect(findRereadPosition('Then I moved to Canada with', script, at('Then'))).toBe(-1)
	})

	test('stays: one reading never commits, a second that moved on does', () => {
		const service = readFileSync(join(import.meta.dir, 'voice-tracking-service.ts'), 'utf8')
		expect(service).toContain('rereadEnd > this.pendingRereadIndex')
		const block = service.slice(service.indexOf('const rereadEnd ='), service.indexOf('this.pendingRereadIndex = -1\n\n    let newIndex'))
		expect(block.indexOf('if (!movedOn)')).toBeLessThan(block.indexOf('this.seekToWord(rereadEnd)'))
	})
})

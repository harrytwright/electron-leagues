import AdmZip from 'adm-zip'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const outDir = process.argv[2]
mkdirSync(outDir, { recursive: true })

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

function makeDoc(name, heading, hint) {
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:rPr><w:b/><w:sz w:val="48"/></w:rPr><w:t>${heading}</w:t></w:r></w:p>
    <w:p><w:r><w:t>${hint}</w:t></w:r></w:p>
  </w:body>
</w:document>`
  const zip = new AdmZip()
  zip.addFile('[Content_Types].xml', Buffer.from(contentTypes))
  zip.addFile('_rels/.rels', Buffer.from(rels))
  zip.addFile('word/document.xml', Buffer.from(document))
  zip.writeZip(join(outDir, name))
  console.log('wrote', name)
}

makeDoc('Rules.docx', 'League Rules', 'Replace this template with your league rules.')
makeDoc(
  'Sign-In Sheet.docx',
  'Sign-In Sheet',
  'Replace this template with your sign-in sheet layout.'
)

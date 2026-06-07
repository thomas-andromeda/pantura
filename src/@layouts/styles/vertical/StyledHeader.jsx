// Third-party Imports
import styled from '@emotion/styled'

// Config Imports
import themeConfig from '@configs/themeConfig'

// Util Imports
import { verticalLayoutClasses } from '@layouts/utils/layoutClasses'

const StyledHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: center;
  inline-size: 100%;
  flex-shrink: 0;
  min-block-size: var(--header-height);

  &.ts-vertical-layout-header-detached {
    padding-block-start: 12px;
    padding-block-end: 4px;
    padding-inline: ${themeConfig.layoutPadding}px;

    .${verticalLayoutClasses.navbar} {
      background-color: var(--mui-palette-background-paper);
      border: 1px solid var(--mui-palette-divider);
      border-radius: 12px;
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.03), 0 2px 6px rgba(0, 0, 0, 0.02);
      padding-inline: 20px;
    }
  }

  .${verticalLayoutClasses.navbar} {
    position: relative;
    padding-block: 10px;
    padding-inline: ${themeConfig.layoutPadding}px;
    inline-size: 100%;
    margin-inline: auto;
    max-inline-size: ${themeConfig.compactContentWidth}px;
  }

  ${({ overrideStyles }) => overrideStyles}
`

export default StyledHeader

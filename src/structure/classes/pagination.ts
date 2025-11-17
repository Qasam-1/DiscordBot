/*
 * -------------------------------------------------------------------------------------------------------
 * Copyright (c) Vijay Meena <vijayymmeena@gmail.com> (https://github.com/vijayymmeena). All rights reserved.
 * Licensed under the Apache License. See License.txt in the project root for license information.
 * -------------------------------------------------------------------------------------------------------
 */
import {
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  StringSelectMenuBuilder,
  ChannelType,
  ChatInputCommandInteraction,
  CommandInteraction,
  ContextMenuCommandInteraction,
  Message,
  MessageComponentInteraction,
  type ButtonInteraction,
  type StringSelectMenuInteraction
} from 'discord.js';
import cloneDeep from 'lodash/cloneDeep';

// Local type definitions to replace the problematic imports
type Resolver = (page: number, pagination: Pagination) => Promise<PaginationItem> | PaginationItem;

export class PaginationResolver<T extends Resolver = Resolver> {
  constructor(
    public resolver: T,
    public maxLength: number
  ) {}
}

// Import only the types that are actually available from the module
import {
  defaultIds,
  defaultPerPageItem,
  defaultTime,
  SelectMenuPageId,
  type ButtonOptions,
  type IPaginate,
  type PaginationItem,
  type PaginationOptions,
  type PaginationSendTo,
  type PaginationInteractions,
  type PaginationCollectors,
  type PaginationConfig
} from 'types/pagination';

//#region Pagination Utility Functions

const DEFAULT_CURRENT_PAGE = 0;
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_MAX_PAGES = 10;
const MIN_PAGE_NUMBER = 0;
const MIN_TOTAL_ITEMS = 0;
const MIN_PAGE_SIZE = 1;
const MIN_MAX_PAGES = 1;

/**
 * Validates pagination input parameters
 * @param totalItems - Total number of items to paginate
 * @param currentPage - Current page number
 * @param pageSize - Number of items per page
 * @param maxPages - Maximum number of page links to display
 * @throws {Error} When validation fails
 */
function validatePaginationInputs(totalItems: number, currentPage: number, pageSize: number, maxPages: number): void {
  if (!Number.isInteger(totalItems) || totalItems < MIN_TOTAL_ITEMS) {
    throw new Error(`Total items must be a non-negative integer, received: ${totalItems.toString()}`);
  }

  if (!Number.isInteger(currentPage) || currentPage < MIN_PAGE_NUMBER) {
    throw new Error(`Current page must be a non-negative integer, received: ${currentPage.toString()}`);
  }

  if (!Number.isInteger(pageSize) || pageSize < MIN_PAGE_SIZE) {
    throw new Error(`Page size must be a positive integer, received: ${pageSize.toString()}`);
  }

  if (!Number.isInteger(maxPages) || maxPages < MIN_MAX_PAGES) {
    throw new Error(`Max pages must be a positive integer, received: ${maxPages.toString()}`);
  }
}

/**
 * Calculates the total number of pages based on total items and page size
 * @param totalItems - Total number of items
 * @param pageSize - Number of items per page
 * @returns Total number of pages
 */
function calculateTotalPages(totalItems: number, pageSize: number): number {
  return Math.ceil(totalItems / pageSize);
}

/**
 * Normalizes the current page to ensure it's within valid bounds
 * @param currentPage - The requested current page
 * @param totalPages - Total number of available pages
 * @returns Normalized current page within valid range
 */
function normalizeCurrentPage(currentPage: number, totalPages: number): number {
  if (totalPages === 0) return 0;
  return Math.max(MIN_PAGE_NUMBER, Math.min(currentPage, totalPages - 1));
}

/**
 * Calculates the range of pages to display in pagination controls
 * @param currentPage - Current page number
 * @param totalPages - Total number of pages
 * @param maxPages - Maximum number of page links to display
 * @returns Object containing start and end page numbers
 */
function calculatePageRange(currentPage: number, totalPages: number, maxPages: number): { startPage: number; endPage: number } {
  if (totalPages <= maxPages) {
    return { startPage: 0, endPage: totalPages - 1 };
  }

  const maxPagesBeforeCurrentPage = Math.floor(maxPages / 2);
  const maxPagesAfterCurrentPage = Math.ceil(maxPages / 2) - 1;

  if (currentPage <= maxPagesBeforeCurrentPage) {
    // Current page is near the start
    return { startPage: 0, endPage: maxPages - 1 };
  }

  if (currentPage + maxPagesAfterCurrentPage >= totalPages) {
    // Current page is near the end
    return {
      startPage: totalPages - maxPages,
      endPage: totalPages - 1
    };
  }

  // Current page is in the middle
  return {
    startPage: currentPage - maxPagesBeforeCurrentPage,
    endPage: currentPage + maxPagesAfterCurrentPage
  };
}

/**
 * Calculates the start and end item indexes for the current page
 * @param currentPage - Current page number
 * @param pageSize - Number of items per page
 * @param totalItems - Total number of items
 * @returns Object containing start and end indexes
 */
function calculateItemIndexes(currentPage: number, pageSize: number, totalItems: number): { startIndex: number; endIndex: number } {
  const startIndex = currentPage * pageSize;
  const endIndex = Math.min(startIndex + pageSize - 1, totalItems - 1);

  return { startIndex, endIndex };
}

/**
 * Generates an array of page numbers for pagination controls
 * @param startPage - First page number to include
 * @param endPage - Last page number to include
 * @returns Array of page numbers
 */
function generatePageNumbers(startPage: number, endPage: number): number[] {
  const pageCount = endPage - startPage + 1;
  return Array.from({ length: pageCount }, (_, index) => startPage + index);
}

/**
 * Creates pagination data for UI controls and data slicing
 * @param config - Pagination configuration object
 * @returns Complete pagination information
 * @throws {Error} When input validation fails
 *
 * @example
 * ```typescript
 * const pagination = createPagination({
 *   totalItems: 100,
 *   currentPage: 5,
 *   pageSize: 10,
 *   maxPages: 7
 * });
 * ```
 */
export function createPagination(config: PaginationConfig): IPaginate {
  const { totalItems, currentPage = DEFAULT_CURRENT_PAGE, pageSize = DEFAULT_PAGE_SIZE, maxPages = DEFAULT_MAX_PAGES } = config;

  try {
    validatePaginationInputs(totalItems, currentPage, pageSize, maxPages);

    const totalPages = calculateTotalPages(totalItems, pageSize);
    const normalizedCurrentPage = normalizeCurrentPage(currentPage, totalPages);
    const { startPage, endPage } = calculatePageRange(normalizedCurrentPage, totalPages, maxPages);
    const { startIndex, endIndex } = calculateItemIndexes(normalizedCurrentPage, pageSize, totalItems);
    const pages = generatePageNumbers(startPage, endPage);

    return {
      currentPage: normalizedCurrentPage,
      endIndex,
      endPage,
      pageSize,
      pages,
      startIndex,
      startPage,
      totalItems,
      totalPages
    };
  } catch (error) {
    throw new Error(`Pagination creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

//#endregion

//#region PaginationBuilder Class

export class PaginationBuilder {
  private readonly item: PaginationItem;
  private readonly currentPage: number;
  private readonly perPage: number;
  private readonly skipAmount: number;
  private readonly maxPage: number;
  private readonly config?: PaginationOptions;

  constructor(_item: PaginationItem, _currentPage: number, _maxPage: number, _config?: PaginationOptions) {
    this.item = this.prepareMessage(_item);
    this.currentPage = _currentPage;
    this.maxPage = _maxPage;
    this.config = _config;
    this.perPage = _config?.itemsPerPage ?? defaultPerPageItem;
    this.skipAmount = _config?.buttons?.skipAmount ?? defaultPerPageItem;
    this.validateInputs();
  }

  private validateInputs(): void {
    if (this.currentPage < 0 || this.currentPage >= this.maxPage) {
      throw new Error(`Page ${this.currentPage.toString()} is out of bounds (0-${String(this.maxPage - 1)})`);
    }

    if (this.maxPage <= 0) {
      throw new Error('Maximum pages must be greater than 0');
    }

    if (this.config?.buttons?.disabled && this.config.selectMenu?.disabled) {
      throw new Error('Both navigation buttons and the select menu cannot be disabled at the same time');
    }
  }

  private prepareMessage(item: PaginationItem): PaginationItem {
    return {
      ...item,
      attachments: item.attachments ?? [],
      components: item.components ?? [],
      embeds: item.embeds ?? [],
      files: item.files ?? []
    };
  }

  /**
   * Get the display text for a page
   */
  private getPageText(pageNumber: number): string {
    if (Array.isArray(this.config?.selectMenu?.pageText)) {
      return this.config.selectMenu.pageText[pageNumber] ?? 'Page {page}';
    }

    return this.config?.selectMenu?.pageText ?? 'Page {page}';
  }

  /**
   * Create page-specific options for select menu
   */
  private createPageOptions(paginator: IPaginate) {
    const options = paginator.pages.map((pageNumber) => {
      const pageText = this.getPageText(pageNumber);

      return {
        label: pageText.replace('{page}', (pageNumber + 1).toString().padStart(2, '0')),
        value: pageNumber.toString()
      };
    });

    if (paginator.currentPage !== 0) {
      options.unshift({
        label: this.config?.selectMenu?.labels?.start ?? 'First page',
        value: SelectMenuPageId.Start.toString()
      });
    }

    if (paginator.currentPage !== paginator.totalPages - 1) {
      options.push({
        label: this.config?.selectMenu?.labels?.end ?? 'Last page',
        value: SelectMenuPageId.End.toString()
      });
    }

    return options;
  }

  private calculateButtonStates(): Record<string, boolean> {
    return {
      canGoPrevious: this.currentPage > 0,
      canSkipBackward: this.currentPage > 0,
      canSkipForward: this.currentPage < this.maxPage - 1,
      canGoNext: this.currentPage < this.maxPage - 1
    };
  }

  private createNavigationButtons(): ButtonBuilder[] {
    const states = this.calculateButtonStates();

    const pageMiddleButton = this.item.middleButton;

    const buttonConfigs = [
      {
        key: 'previous',
        defaults: {
          emoji: '◀️',
          id: defaultIds.buttons.previous,
          label: 'Previous',
          style: ButtonStyle.Secondary
        },
        disabled: !states.canGoPrevious,
        enabled: true
      },
      {
        key: 'backward',
        defaults: {
          emoji: '⏪',
          id: defaultIds.buttons.backward,
          label: `-${String(Math.min(this.currentPage, this.skipAmount))}`,
          style: ButtonStyle.Primary
        },
        disabled: !states.canSkipBackward,
        enabled: true
      },
      {
        key: 'middle',
        defaults: {
          emoji: '🔘',
          id: defaultIds.buttons.middle,
          label: 'Action',
          style: ButtonStyle.Success
        },
        disabled: false,
        enabled: false,
        pageConfig: pageMiddleButton
      },
      {
        key: 'forward',
        defaults: {
          emoji: '⏩',
          id: defaultIds.buttons.forward,
          label: `+${String(Math.min(this.maxPage - (this.currentPage + 1), this.skipAmount))}`,
          style: ButtonStyle.Primary
        },
        disabled: !states.canSkipForward,
        enabled: true
      },
      {
        key: 'next',
        defaults: {
          emoji: '▶️',
          id: defaultIds.buttons.next,
          label: 'Next',
          style: ButtonStyle.Secondary
        },
        disabled: !states.canGoNext,
        enabled: true
      },
      {
        key: 'exit',
        defaults: {
          emoji: '⚔️',
          id: defaultIds.buttons.exit,
          label: 'Stop',
          style: ButtonStyle.Danger
        },
        disabled: false,
        enabled: false
      }
    ] as const;

    const buttons: ButtonBuilder[] = [];

    for (const config of buttonConfigs) {
      const userConfig = this.config?.buttons?.[config.key];

      let effectiveConfig = userConfig;
      let isEnabled = userConfig?.enabled ?? config.enabled;

      if (config.key === 'middle' && 'pageConfig' in config) {
        const pageConfig = config.pageConfig as ButtonOptions | undefined;
        if (pageConfig) {
          effectiveConfig = pageConfig;
          isEnabled = pageConfig.enabled ?? true;
        }
      }

      if (isEnabled) {
        buttons.push(this.createButton({ ...config, userConfig: effectiveConfig }));
      }
    }

    return buttons;
  }

  private createButton(config: {
    key: keyof typeof defaultIds.buttons;
    defaults: Required<Omit<ButtonOptions, 'enabled'>>;
    disabled: boolean;
    userConfig?: ButtonOptions;
  }): ButtonBuilder {
    const userConfig = config.userConfig;

    const button = new ButtonBuilder()
      .setCustomId(userConfig?.id ?? config.defaults.id)
      .setStyle(userConfig?.style ?? config.defaults.style)
      .setDisabled(config.disabled);

    const label = userConfig?.label ?? config.defaults.label;
    if (label) {
      button.setLabel(label);
    }

    const emoji = userConfig?.emoji ?? config.defaults.emoji;
    if (emoji) {
      button.setEmoji(emoji);
    }

    if (!label && !emoji) {
      throw Error('Pagination buttons must include either an emoji or a label');
    }

    return button;
  }

  public getBaseItem(): PaginationItem {
    return this.item;
  }

  public getPaginatedItem(): PaginationItem {
    const paginator = createPagination({
      currentPage: this.currentPage,
      totalItems: this.maxPage,
      pageSize: 1,
      maxPages: this.perPage
    });

    // Calculate the range for the placeholder
    const defaultFormat = 'Currently viewing #{start} - #{end} of #{total}';
    const format = this.config?.selectMenu?.rangePlaceholderFormat ?? defaultFormat;

    const rangePlaceholder = format
      .replace('{start}', (paginator.startPage + 1).toString())
      .replace('{end}', (paginator.endPage + 1).toString())
      .replace('{total}', paginator.totalItems.toString());

    // Prepare menu selection
    const options = this.createPageOptions(paginator);
    const menu = new StringSelectMenuBuilder()
      .setCustomId(this.config?.selectMenu?.menuId ?? defaultIds.menu)
      .setPlaceholder(rangePlaceholder)
      .setOptions(options);

    // Prepare buttons
    const buttons = this.createNavigationButtons();

    // Add pagination row to components
    const messageComponents = this.item.components ?? [];
    const components = [...messageComponents];

    // Add menu row
    if (!this.config?.selectMenu?.disabled) {
      components.push({
        components: [menu],
        type: ComponentType.ActionRow
      });
    }

    // Add button row
    if (!this.config?.buttons?.disabled) {
      components.push({
        components: buttons,
        type: ComponentType.ActionRow
      });
    }

    return { ...this.item, components };
  }
}

//#endregion

//#region Pagination Class

export class Pagination<T extends PaginationResolver = PaginationResolver> {
  //#region Properties & Constructor

  private _pages: PaginationItem[] | T = [];
  private _maxLength = 0;
  private _currentPage = 0;
  private _collectors?: PaginationCollectors;

  private _message?: Message;
  private _isSent = false;
  private _isFollowUp = false;

  // Static map to track instances with autoRefresh enabled
  private static instances = new Map<string, Pagination>();

  get message(): Message {
    if (!this._message) {
      throw new Error('Pagination has not sent yet. Please send pagination to retrieve message');
    }

    return this._message;
  }

  get isSent(): boolean {
    return this._isSent;
  }

  get currentPage(): number {
    return this._currentPage;
  }

  get maxLength(): number {
    return this._maxLength;
  }

  get pages(): PaginationItem[] | T {
    return this._pages;
  }

  // Public getter for autoRefresh status
  get autoRefreshEnabled(): boolean {
    return this.config?.autoRefresh ?? false;
  }

  setCurrentPage(page: number) {
    if (page < 0 || page >= this._maxLength) {
      throw new Error(`Page ${page.toString()} is out of bounds. Must be between 0 and ${(this._maxLength - 1).toString()}`);
    }

    this._currentPage = page;
  }

  setMaxLength(length: number): void {
    if (length <= 0) {
      throw new Error('Maximum length must be greater than 0');
    }

    this._maxLength = length;

    // Reset to first page if current page is out of bounds
    if (this._currentPage >= this._maxLength) {
      this._currentPage = 0;
    }
  }

  setPages(pages: PaginationItem[] | T): void {
    this._pages = pages;
    this._maxLength = Array.isArray(pages) ? pages.length : pages.maxLength;
    // Reset to first page if current page is out of bounds
    if (this._currentPage >= this._maxLength) {
      this._currentPage = 0;
    }
  }

  constructor(
    private sendTo: PaginationSendTo,
    pageData: PaginationItem[] | T,
    private config?: PaginationOptions
  ) {
    this._currentPage = config?.initialPage ?? 0;
    this.setPages(pageData);

    // Validate configuration
    this.validateConfiguration();
  }

  //#endregion

  //#region Static Methods for Auto-Refresh

  /**
   * Get a pagination instance by message ID (only for instances with autoRefresh enabled)
   */
  public static getInstance(messageId: string): Pagination | undefined {
    return this.instances.get(messageId);
  }

  /**
   * Get all pagination instances with autoRefresh enabled
   */
  public static getAllInstances(): Map<string, Pagination> {
    return new Map(this.instances);
  }

  /**
   * Clear all stored pagination instances
   */
  public static clearInstances(): void {
    this.instances.clear();
  }

  /**
   * Check if autoRefresh should be enabled for this instance
   */
  private shouldEnableAutoRefresh(): boolean {
    return this.config?.autoRefresh ?? false;
  }

  /**
   * Store this instance if autoRefresh is enabled
   */
  private storeInstance(): void {
    if (this._message && this.shouldEnableAutoRefresh()) {
      Pagination.instances.set(this._message.id, this);
      this.debug(`Auto-refresh enabled for pagination instance: ${this._message.id}`);
    }
  }

  /**
   * Remove this instance from storage
   */
  private removeInstance(): void {
    if (this._message) {
      Pagination.instances.delete(this._message.id);
    }
  }

  /**
   * Force refresh the pagination with fresh data
   */
  public async forceRefresh(): Promise<void> {
    if (!this._message) {
      throw new Error('Cannot refresh: Pagination message not found');
    }

    if (!this.shouldEnableAutoRefresh()) {
      this.debug('Auto-refresh is disabled for this pagination instance');
      return;
    }

    try {
      const currentPage = this._currentPage;
      const freshPage = await this.getPage(currentPage);
      const updatedContent = freshPage.getPaginatedItem();

      await this._message.edit(updatedContent);
      this.debug(`Pagination force-refreshed on page ${currentPage}`);
    } catch (error) {
      this.debug(`Failed to force refresh: ${error}`);
      throw error;
    }
  }

  //#endregion

  //#region Configuration & Validation

  /**
   * Validate configuration and throw descriptive errors
   */
  private validateConfiguration(): void {
    if (this.config?.ephemeral && this.config.buttons?.exit?.enabled) {
      throw new Error('Ephemeral pagination does not support exit mode');
    }

    if (this.maxLength <= 0) {
      throw new Error('Pagination must have at least one page');
    }

    if (this.currentPage < 0 || this.currentPage >= this.maxLength) {
      throw new Error(`Initial page ${this.currentPage.toString()} is out of bounds. Must be between 0 and ${(this.maxLength - 1).toString()}`);
    }

    // Validate button options
    this.validateButtonOptions();
  }

  /**
   * Validate button configuration
   */
  private validateButtonOptions(): void {
    // Check for duplicate button IDs
    const ids = [this.getButtonId('previous'), this.getButtonId('backward'), this.getButtonId('forward'), this.getButtonId('next'), this.getButtonId('exit')];

    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length > 0) {
      throw new Error(`Duplicate button IDs found: ${duplicates.join(', ')}`);
    }
  }

  //#endregion

  //#region Utility & Helper Methods

  /**
   * Log debug messages with consistent formatting
   */
  private debug(message: string): void {
    if (this.config?.debug) {
      console.log(`[Pagination] ${message}`);
    }
  }

  /**
   * Handle update errors gracefully
   */
  private unableToUpdate(error?: unknown): void {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    this.debug(`Unable to update pagination: ${errorMessage}`);
  }

  /**
   * Get skip amount
   */
  private getSkipAmount() {
    return this.config?.buttons?.skipAmount ?? defaultPerPageItem;
  }

  /**
   * Get button ID with fallback to default
   */
  private getButtonId(buttonType: 'previous' | 'backward' | 'forward' | 'next' | 'exit'): string {
    return this.config?.buttons?.[buttonType]?.id ?? defaultIds.buttons[buttonType];
  }

  /**
   * Get menu ID with fallback to default
   */
  private getMenuId(): string {
    return this.config?.selectMenu?.menuId ?? defaultIds.menu;
  }

  /**
   * Get time with fallback to default
   */
  private getTime(): number {
    return this.config?.time ?? defaultTime;
  }

  //#endregion

  //#region Public API - Core Functionality

  /**
   * Get page
   */
  public getPage = async (page: number): Promise<PaginationBuilder> => {
    if (page < 0 || page >= this.maxLength) {
      throw new Error(`Page ${String(page)} is out of bounds (0-${String(this.maxLength - 1)})`);
    }

    const item = Array.isArray(this.pages) ? cloneDeep<PaginationItem | undefined>(this.pages[page]) : await this.pages.resolver(page, this);

    if (!item) {
      throw new Error(`No content found for page ${page.toString()}`);
    }

    const pagination = new PaginationBuilder(item, page, this.maxLength, this.config);

    return pagination;
  };

  /**
   * Send pagination
   * @returns
   */
  public async send(): Promise<{
    collectors: PaginationCollectors;
    message: Message;
  }> {
    if (this._isSent) {
      throw new Error('Pagination has already been sent. Create a new instance to send again.');
    }

    try {
      // Prepare and send initial message
      const page = await this.getPage(this.currentPage);
      const message = await this.sendMessage(page.getPaginatedItem());

      // Create and setup collector
      const collectors = this.createCollector(message);

      this._collectors = collectors;
      this._message = message;
      this._isSent = true;

      // Store instance if autoRefresh is enabled
      this.storeInstance();

      this.debug(`Pagination sent successfully with ${this.maxLength.toString()} pages`);

      return { collectors, message };
    } catch (error) {
      this.debug(`Failed to send pagination: ${String(error)}`);
      throw new Error(`Failed to send pagination: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Stop the pagination collector
   */
  public stop(): void {
    if (this._collectors) {
      if (!this._collectors.buttonCollector.ended) {
        this._collectors.buttonCollector.stop();
      }
      if (!this._collectors.menuCollector.ended) {
        this._collectors.menuCollector.stop();
      }

      // Remove from instances map
      this.removeInstance();

      this.debug('Pagination stopped manually');
    }
  }

  //#endregion

  //#region Public API - Navigation

  /**
   * Navigate to a specific page
   */
  public navigateToPage(page: number): boolean {
    if (page < 0 || page >= this.maxLength) {
      this.debug(`Cannot navigate to page ${page.toString()}: out of bounds (0-${String(this.maxLength - 1)})`);
      return false;
    }

    if (page === this.currentPage) {
      this.debug(`Already on page ${page.toString()}`);
      return false;
    }

    this.setCurrentPage(page);
    this.debug(`Navigated to page ${page.toString()}`);
    return true;
  }

  /**
   * Navigate to next page
   */
  public navigateNext(): boolean {
    if (this.currentPage >= this.maxLength - 1) {
      this.debug('Cannot navigate next: already on last page');
      return false;
    }

    this.setCurrentPage(this.currentPage + 1);
    this.debug(`Navigated to next page: ${this.currentPage.toString()}`);
    return true;
  }

  /**
   * Navigate to previous page
   */
  public navigatePrevious(): boolean {
    if (this.currentPage <= 0) {
      this.debug('Cannot navigate previous: already on first page');
      return false;
    }

    this.setCurrentPage(this.currentPage - 1);
    this.debug(`Navigated to previous page: ${this.currentPage.toString()}`);
    return true;
  }

  //#endregion

  //#region Public API - State & Utilities

  /**
   * Check if pagination can navigate to next page
   */
  public canNavigateNext(): boolean {
    return this.currentPage < this.maxLength - 1;
  }

  /**
   * Check if pagination can navigate to previous page
   */
  public canNavigatePrevious(): boolean {
    return this.currentPage > 0;
  }

  /**
   * Get current page info
   */
  public getPageInfo(): {
    currentPage: number;
    totalPages: number;
    canNext: boolean;
    canPrevious: boolean;
    isFirst: boolean;
    isLast: boolean;
  } {
    return {
      currentPage: this.currentPage,
      totalPages: this.maxLength,
      canNext: this.canNavigateNext(),
      canPrevious: this.canNavigatePrevious(),
      isFirst: this.currentPage === 0,
      isLast: this.currentPage === this.maxLength - 1
    };
  }

  /**
   * Navigate to first page
   */
  public navigateToStart(): boolean {
    if (this.currentPage === 0) {
      this.debug('Already on first page');
      return false;
    }

    this.setCurrentPage(0);
    this.debug('Navigated to start page');
    return true;
  }

  /**
   * Navigate to last page
   */
  public navigateToEnd(): boolean {
    const lastPage = this.maxLength - 1;
    if (this.currentPage === lastPage) {
      this.debug('Already on last page');
      return false;
    }

    this.setCurrentPage(lastPage);
    this.debug('Navigated to end page');
    return true;
  }

  //#endregion

  //#region Private - Message Handling

  /**
   * Handle exit
   */
  private async handleExit(interaction: ButtonInteraction): Promise<void> {
    try {
      await interaction.deferUpdate();

      const page = await this.getPage(this.currentPage);

      await interaction.editReply(page.getBaseItem());
      this.stop();
    } catch (error) {
      this.unableToUpdate(error);
    }
  }

  /**
   * Update the pagination message with current page
   */
  private async updatePaginationMessage(interaction: ButtonInteraction | StringSelectMenuInteraction): Promise<void> {
    try {
      await interaction.deferUpdate();

      // Get current page data
      const page = await this.getPage(this.currentPage);

      // Update the message
      await interaction.editReply(page.getPaginatedItem());
    } catch (error) {
      this.unableToUpdate(error);
    }
  }

  /**
   * Send message via interaction (reply or followUp)
   */
  private async sendInteractionMessage(message: PaginationItem): Promise<Message> {
    const interaction = this.sendTo as PaginationInteractions;

    // Check if this should be a follow-up
    if (interaction.deferred || interaction.replied) {
      this._isFollowUp = true;
    }

    const messageOptions = {
      ...message,
      ...(this.config?.ephemeral && {
        flags: 1 << 6
      })
    };

    if (this._isFollowUp) {
      const reply = await interaction.followUp({
        ...messageOptions,
        fetchReply: true
      });
      return reply;
    } else {
      const response = await interaction.reply({
        ...messageOptions,
        withResponse: true
      });

      const message = response.resource?.message;
      if (!message) {
        throw new Error(
          'Missing Intent: GUILD_MESSAGES\n' +
            'Without guild message intent, pagination does not work. ' +
            'Consider adding GUILD_MESSAGES as an intent\n' +
            'Read more at https://discordx.js.org/docs/faq/Errors/Pagination#missing-intent-guild_messages'
        );
      }
      return message;
    }
  }

  /**
   * Send message based on sendTo type
   */
  private async sendMessage(message: PaginationItem): Promise<Message> {
    if (this.sendTo instanceof Message) {
      return await this.sendTo.reply(message);
    }

    if (
      this.sendTo instanceof CommandInteraction ||
      this.sendTo instanceof MessageComponentInteraction ||
      this.sendTo instanceof ContextMenuCommandInteraction
    ) {
      return await this.sendInteractionMessage(message);
    }

    if (this.sendTo.type === ChannelType.GuildStageVoice) {
      throw new Error('Pagination not supported with guild stage channel');
    }

    return await this.sendTo.send(message);
  }

  //#endregion

  //#region Private - Collector Management

  /**
   * Create and configure the collectors
   */
  private createCollector(message: Message): PaginationCollectors {
    // Create button collector
    const buttonCollector = message.createMessageComponentCollector({
      ...this.config,
      componentType: ComponentType.Button,
      time: this.getTime()
    });

    // Create select menu collector
    const menuCollector = message.createMessageComponentCollector({
      ...this.config,
      componentType: ComponentType.StringSelect,
      time: this.getTime()
    });

    // Setup collectors
    this.setupCollectorEvents({ buttonCollector, menuCollector });

    // Return the primary collector for compatibility
    return { buttonCollector, menuCollector };
  }

  /**
   * Setup collector event handlers
   */
  private setupCollectorEvents({ buttonCollector, menuCollector }: PaginationCollectors): void {
    const resetCollectorTimers = () => {
      const timerOptions = {
        idle: this.config?.idle,
        time: this.getTime()
      };
      buttonCollector.resetTimer(timerOptions);
      menuCollector.resetTimer(timerOptions);
    };

    // Handle button interactions
    buttonCollector.on('collect', async (interaction) => {
      const shouldContinue = this.handleButtonInteraction(interaction);
      if (shouldContinue) {
        await this.updatePaginationMessage(interaction);
        resetCollectorTimers();
      }
    });

    // Handle select menu interactions
    menuCollector.on('collect', async (interaction) => {
      const shouldContinue = this.handleSelectMenuInteraction(interaction);
      if (shouldContinue) {
        await this.updatePaginationMessage(interaction);
        resetCollectorTimers();
      }
    });

    // Handle collector end
    buttonCollector.on('end', () => {
      menuCollector.stop();
      void this.handleCollectorEnd();
    });

    menuCollector.on('end', () => {
      buttonCollector.stop();
      void this.handleCollectorEnd();
    });
  }

  /**
   * Handle button interaction
   */
  private handleButtonInteraction(interaction: ButtonInteraction): boolean {
    const customId = interaction.customId;

    if (customId === defaultIds.buttons.exit) {
      void this.handleExit(interaction);
      return false;
    } else if (customId === defaultIds.buttons.previous) {
      return this.navigatePrevious();
    } else if (customId === defaultIds.buttons.next) {
      return this.navigateNext();
    } else if (customId === defaultIds.buttons.backward) {
      return this.navigateToPage(Math.max(0, this.currentPage - this.getSkipAmount()));
    } else if (customId === defaultIds.buttons.forward) {
      return this.navigateToPage(Math.min(this.maxLength - 1, this.currentPage + this.getSkipAmount()));
    }

    return false;
  }

  /**
   * Handle select menu interaction
   */
  private handleSelectMenuInteraction(interaction: StringSelectMenuInteraction): boolean {
    if (interaction.customId !== this.getMenuId()) {
      return false;
    }

    const selectedValue = Number(interaction.values[0] ?? 0);

    if (selectedValue === SelectMenuPageId.Start) {
      return this.navigateToStart();
    } else if (selectedValue === SelectMenuPageId.End) {
      return this.navigateToEnd();
    } else {
      return this.navigateToPage(selectedValue);
    }
  }

  /**
   * Handle collector end event
   */
  private async handleCollectorEnd(): Promise<void> {
    if (!this._message) return;

    try {
      const page = await this.getPage(this.currentPage);
      if (this.message.editable) {
        // Handle ephemeral pagination
        if (this.config?.ephemeral && this.sendTo instanceof ChatInputCommandInteraction && !this._isFollowUp) {
          await this.sendTo.editReply(page.getBaseItem());
        } else {
          await this.message.edit(page.getBaseItem());
        }
      }

      // Remove from instances map
      this.removeInstance();

      // Call timeout callback if provided
      if (this.config?.onTimeout) {
        this.config.onTimeout(this.currentPage, this.message);
      }
    } catch (error) {
      this.unableToUpdate(error);
    }
  }

  //#endregion
}

//#endregion

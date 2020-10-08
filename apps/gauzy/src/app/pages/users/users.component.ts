import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import {
	ActivatedRoute,
	Router,
	RouterEvent,
	NavigationEnd
} from '@angular/router';
import {
	IRole,
	InvitationTypeEnum,
	PermissionsEnum,
	IUserOrganization,
	IOrganization,
	IUserOrganizationCreateInput,
	RolesEnum,
	IUser,
	ITag,
	ComponentLayoutStyleEnum
} from '@gauzy/models';
import { NbDialogService, NbToastrService } from '@nebular/theme';
import { TranslateService } from '@ngx-translate/core';
import { LocalDataSource } from 'ng2-smart-table';
import { Subject } from 'rxjs';
import { first, takeUntil } from 'rxjs/operators';
import { Store } from '../../@core/services/store.service';
import { UsersOrganizationsService } from '../../@core/services/users-organizations.service';
import { DeleteConfirmationComponent } from '../../@shared/user/forms/delete-confirmation/delete-confirmation.component';
import { UserMutationComponent } from '../../@shared/user/user-mutation/user-mutation.component';
import { InviteMutationComponent } from '../../@shared/invite/invite-mutation/invite-mutation.component';
import { TranslationBaseComponent } from '../../@shared/language-base/translation-base.component';
import { UsersService } from '../../@core/services';
import { PictureNameTagsComponent } from '../../@shared/table-components/picture-name-tags/picture-name-tags.component';
import { ComponentEnum } from '../../@core/constants/layout.constants';

interface UserViewModel {
	fullName: string;
	email: string;
	bonus?: number;
	endWork?: any;
	id: string;
	roleName?: string;
	role?: string;
	tags?: ITag[];
}

@Component({
	templateUrl: './users.component.html',
	styleUrls: ['./users.component.scss']
})
export class UsersComponent extends TranslationBaseComponent
	implements OnInit, OnDestroy {
	organizationName: string;
	settingsSmartTable: object;
	sourceSmartTable = new LocalDataSource();
	selectedUser: UserViewModel;
	selectedOrganizationId: string;
	UserRole: IRole;
	userToRemoveId: string;
	userToRemove: IUserOrganization;

	private _ngDestroy$ = new Subject<void>();

	userName = 'User';

	organization: IOrganization;
	loading = true;
	hasEditPermission = false;
	hasInviteEditPermission = false;
	hasInviteViewOrEditPermission = false;
	hasSuperAdminPermission = false;
	organizationInvitesAllowed = false;
	showAddCard: boolean;
	userToEdit: IUserOrganization;
	users: IUser[] = [];
	tags: ITag[];
	selectedTags: any;
	viewComponentName: ComponentEnum;
	disableButton = true;
	dataLayoutStyle = ComponentLayoutStyleEnum.TABLE;
	userData: IUser[];
	@ViewChild('usersTable') usersTable;

	constructor(
		private dialogService: NbDialogService,
		private store: Store,
		private router: Router,
		private toastrService: NbToastrService,
		private route: ActivatedRoute,
		private translate: TranslateService,
		private userOrganizationsService: UsersOrganizationsService,
		private readonly usersService: UsersService
	) {
		super(translate);
		this.setView();
	}

	async ngOnInit() {
		this.store.selectedOrganization$
			.pipe(takeUntil(this._ngDestroy$))
			.subscribe((organization) => {
				if (organization) {
					this.organization = organization;
					this.selectedOrganizationId = organization.id;
					this.organizationInvitesAllowed =
						organization.invitesAllowed;
					this.cancel();
					this.loadUsers();
					this.loadPage();
				}
			});

		this._loadSmartTableSettings();
		this._applyTranslationOnSmartTable();

		this.store.userRolePermissions$
			.pipe(takeUntil(this._ngDestroy$))
			.subscribe(() => {
				this.hasEditPermission = this.store.hasPermission(
					PermissionsEnum.ORG_USERS_EDIT
				);
				this.hasInviteEditPermission = this.store.hasPermission(
					PermissionsEnum.ORG_INVITE_EDIT
				);
				this.hasInviteViewOrEditPermission =
					this.store.hasPermission(PermissionsEnum.ORG_INVITE_VIEW) ||
					this.hasInviteEditPermission;
				this.hasSuperAdminPermission = this.store.hasPermission(
					PermissionsEnum.SUPER_ADMIN_EDIT
				);
			});

		this.route.queryParamMap
			.pipe(takeUntil(this._ngDestroy$))
			.subscribe((params) => {
				if (params.get('openAddDialog')) {
					this.add();
				}
			});
		this.router.events
			.pipe(takeUntil(this._ngDestroy$))
			.subscribe((event: RouterEvent) => {
				if (event instanceof NavigationEnd) {
					this.setView();
				}
			});
	}

	setView() {
		this.viewComponentName = ComponentEnum.USERS;
		this.store
			.componentLayout$(this.viewComponentName)
			.pipe(takeUntil(this._ngDestroy$))
			.subscribe((componentLayout) => {
				this.dataLayoutStyle = componentLayout;
			});
	}

	selectUserTmp({ isSelected, data }) {
		const selectedUser = isSelected ? data : null;
		if (this.usersTable) {
			this.usersTable.grid.dataSet.willSelect = false;
		}
		this.disableButton = !isSelected;
		this.selectedUser = selectedUser;
		if (this.selectedUser) {
			this.userToRemoveId = data.id;
			const checkName = data.fullName.trim();
			this.userName = checkName ? checkName : 'User';
		}
		if (data.role === RolesEnum.SUPER_ADMIN)
			this.selectedUser = this.hasSuperAdminPermission
				? this.selectedUser
				: null;
	}

	async add() {
		const dialog = this.dialogService.open(UserMutationComponent, {
			context: {
				isSuperAdmin: this.hasSuperAdminPermission
			}
		});

		const data = await dialog.onClose.pipe(first()).toPromise();
		if (data && data.user) {
			if (data.user.firstName || data.user.lastName) {
				this.userName = data.user.firstName + ' ' + data.user.lastName;
			}
			this.toastrService.primary(
				this.getTranslation(
					'NOTES.ORGANIZATIONS.ADD_NEW_USER_TO_ORGANIZATION',
					{
						username: this.userName.trim(),
						orgname: this.store.selectedOrganization.name
					}
				),
				this.getTranslation('TOASTR.TITLE.SUCCESS')
			);

			this.loadPage();
		}
	}

	async addOrEditUser(user: IUserOrganizationCreateInput) {
		if (user.isActive) {
			await this.userOrganizationsService
				.create(user)
				.pipe(first())
				.toPromise();

			this.toastrService.primary(
				this.getTranslation(
					'NOTES.ORGANIZATIONS.ADD_NEW_USER_TO_ORGANIZATION',
					{
						username: this.userName.trim(),
						orgname: this.store.selectedOrganization.name
					}
				),
				this.getTranslation('TOASTR.TITLE.SUCCESS')
			);

			this.showAddCard = false;
			this.loadPage();
		}
	}

	async invite() {
		const dialog = this.dialogService.open(InviteMutationComponent, {
			context: {
				invitationType: InvitationTypeEnum.USER,
				selectedOrganizationId: this.selectedOrganizationId,
				currentUserId: this.store.userId,
				isSuperAdmin: this.hasSuperAdminPermission,
				selectedOrganization: this.organization
			}
		});

		await dialog.onClose.pipe(first()).toPromise();
	}

	edit(selectedItem?: IUser) {
		if (selectedItem) {
			this.selectUserTmp({
				isSelected: true,
				data: selectedItem
			});
		}
		this.router.navigate(['/pages/users/edit/' + this.selectedUser.id]);
	}

	manageInvites() {
		this.router.navigate(['/pages/users/invites/']);
	}

	async delete(selectedItem?: IUser) {
		if (selectedItem) {
			this.selectUserTmp({
				isSelected: true,
				data: selectedItem
			});
		}
		this.dialogService
			.open(DeleteConfirmationComponent, {
				context: {
					recordType:
						this.selectedUser.fullName +
						' ' +
						this.getTranslation('FORM.DELETE_CONFIRMATION.USER')
				}
			})
			.onClose.pipe(takeUntil(this._ngDestroy$))
			.subscribe(async (result) => {
				if (result) {
					try {
						await this.userOrganizationsService.setUserAsInactive(
							this.selectedUser.id
						);

						this.toastrService.primary(
							this.getTranslation(
								'NOTES.ORGANIZATIONS.DELETE_USER_FROM_ORGANIZATION',
								{
									username: this.userName
								}
							),
							this.getTranslation('TOASTR.TITLE.SUCCESS')
						);

						this.loadPage();
					} catch (error) {
						this.toastrService.danger(
							this.getTranslation(
								'NOTES.ORGANIZATIONS.DATA_ERROR',
								{
									error: error.error.message || error.message
								}
							),
							this.getTranslation('TOASTR.TITLE.ERROR')
						);
					}
				}
			});
	}

	cancel() {
		this.userToEdit = null;
		this.showAddCard = false;
	}

	private async loadUsers() {
		if (!this.organization) {
			return;
		}
		const { id: organizationId, tenantId } = this.organization;
		const { items } = await this.userOrganizationsService.getAll(
			['user', 'user.tags'],
			{ organizationId, tenantId }
		);

		this.users = items.map((user) => user.user);
	}

	async remove(selectedOrganization: UserViewModel) {
		const { id: userOrganizationId } = selectedOrganization;
		const fullName =
			selectedOrganization.fullName.trim() || selectedOrganization.email;

		/**
		 *  User belongs to only 1 organization -> delete user
		 *	User belongs multiple organizations -> remove user from Organization
		 *
		 */
		const count = await this.userOrganizationsService.getUserOrganizationCount(
			userOrganizationId
		);
		const confirmationMessage =
			count === 1
				? 'FORM.DELETE_CONFIRMATION.DELETE_USER'
				: 'FORM.DELETE_CONFIRMATION.REMOVE_USER';

		this.dialogService
			.open(DeleteConfirmationComponent, {
				context: {
					recordType: `${fullName} ${this.getTranslation(
						confirmationMessage
					)}`
				}
			})
			.onClose.pipe(takeUntil(this._ngDestroy$))
			.subscribe(async (result) => {
				if (result) {
					try {
						await this.userOrganizationsService.removeUserFromOrg(
							userOrganizationId
						);

						this.toastrService.primary(
							this.getTranslation('USERS_PAGE.REMOVE_USER', {
								name: fullName
							}),
							this.getTranslation('TOASTR.TITLE.SUCCESS')
						);

						this.loadPage();
					} catch (error) {
						this.toastrService.danger(
							error.error.message || error.message,
							'Error'
						);
					}
				}
			});
	}

	private async loadPage() {
		this.selectedUser = null;
		const { id: organizationId, tenantId, name } = this.organization;
		const { items } = await this.userOrganizationsService.getAll(
			['user', 'user.role', 'user.tags'],
			{ organizationId, tenantId }
		);

		const usersVm = [];
		for (const orgUser of items) {
			if (
				orgUser.isActive &&
				(!orgUser.user.role ||
					orgUser.user.role.name !== RolesEnum.EMPLOYEE)
			) {
				usersVm.push({
					fullName: `${orgUser.user.firstName || ''} ${
						orgUser.user.lastName || ''
					}`,
					email: orgUser.user.email,
					tags: orgUser.user.tags,
					id: orgUser.id,
					isActive: orgUser.isActive,
					imageUrl: orgUser.user.imageUrl,
					role: orgUser.user.role.name,
					roleName: orgUser.user.role
						? this.getTranslation(
								`USERS_PAGE.ROLE.${orgUser.user.role.name}`
						  )
						: ''
				});
			}
		}
		this.userData = usersVm;
		this.sourceSmartTable.load(usersVm);

		if (this.usersTable) {
			this.usersTable.grid.dataSet.willSelect = false;
		}

		this.organizationName = name;
		this.loading = false;
	}

	private _loadSmartTableSettings() {
		this.settingsSmartTable = {
			actions: false,
			columns: {
				fullName: {
					title: this.getTranslation('SM_TABLE.FULL_NAME'),
					type: 'custom',
					renderComponent: PictureNameTagsComponent,
					class: 'align-row'
				},
				email: {
					title: this.getTranslation('SM_TABLE.EMAIL'),
					type: 'email'
				},
				roleName: {
					title: this.getTranslation('SM_TABLE.ROLE'),
					type: 'text'
				}
			},
			pager: {
				display: true,
				perPage: 8
			}
		};
	}

	private _applyTranslationOnSmartTable() {
		this.translate.onLangChange
			.pipe(takeUntil(this._ngDestroy$))
			.subscribe(() => {
				this._loadSmartTableSettings();
			});
	}

	ngOnDestroy() {
		this._ngDestroy$.next();
		this._ngDestroy$.complete();
	}
}
